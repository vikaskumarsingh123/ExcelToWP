import { DynamoDBClient, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  PutCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

import * as https from 'https'; 
import { wordpress_config } from "./credentials.mjs";

const uploadStatus = Object.freeze({
  NOT_STARTED: 0,
  PROCESSING: 1,
  FAILED: 2,
  SUCCESS: 3
});

let buff = Buffer.from(wordpress_config.credentials);
var token = buff.toString('base64');

/**
 * Takes a resource in the IResource frontend interface and sets it up to be inserted/updated in the DynamoDB database in the variable type: value format
 */
function convertToDynamoDBItem ( newResource ) {
  return {
    pdfUrl: { S: newResource.pdfUrl},
    Title: { S: newResource.Title },
    Description: { S: newResource.Description },
    Status: { N: newResource.Status },
    batchId: { S: newResource.batchId },
    id: { S: newResource.id }
  }
}

var dynamodb_options = {}; //the options to pass to our DB instance. Useful when doing local testing/debugging
if( process.env.AWS_SAM_LOCAL ) dynamodb_options = {
  region: 'localhost',
  endpoint: "http://dynamodb:8000"
 };


//const client = new DynamoDBClient( dynamodb_options );

//const dynamo = DynamoDBDocumentClient.from(client);

const tableName = "ExcelToWPEntries";

export const handler = async (event, context) => {
  
  let body = {};
  let statusCode = 200;
  const return_headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers" : "Content-Type",
    "Access-Control-Allow-Origin": "*", // Allow from anywhere 
    "Access-Control-Allow-Methods": "*" // Allow all kinds of requests
  };

  body.successful = [];
  body.failed = [];

  for (const record of event.Records) {
    try {
        var entry = await processMessage(record, context);
        body.successful.push( entry );
    } catch (error) {
        body.failed.push({ ItemIdentifier: record.messageId, errorMesg: error });
    }
  }
  
  console.log('Final return is:');
  console.log(body);
  body = JSON.stringify(body);

  return {
    statusCode,
    body,
    return_headers,
  };
};

async function processMessage(record) {
  if (!record.body) {
      throw new Error('No Body in SQS Message.');
      
  } else {
    console.log('Processing Record: ');
    console.log(record);
    var newResource = JSON.parse(record.body);

    var wp_url = "https://" + wordpress_config.website_url + "/wp-json/wp/v2";
    var wp_post_url = wp_url + "/posts"
    var wp_media_url = wp_url + "/media"

    var post_data = {
      "title": Buffer.from((newResource.Title ?? 'Unknown Title'), 'utf-8').toString(), // ensure it is UTF8 or WP Rest API does not like it.
      "content": Buffer.from((newResource.Description ?? 'No Desc'), 'utf-8').toString(),
      "comment_status": "closed",
      "status": "draft",
      //"featured_media": featured_media_id
    };

    console.log("Sending to WP Rest API");
    var return_from_api = await postToWP(wp_post_url, post_data);
    console.log('WP API says:');
    console.log(return_from_api);

    return newResource;
  }
  
}

function postToWP(url, data) {
  var dataString = JSON.stringify(data);
  dataString = Buffer.from(dataString.replace(/[’]/gm, ''), 'utf-8').toString(); //make sure its UTF8 or else WP Rest API throws a fit.

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': dataString.length,
      'Authorization': 'Basic ' + token
    },
    timeout: 10000, // in ms
  }

  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
    
      const body = []
      res.on('data', (chunk) => body.push(chunk))
      res.on('end', () => {
        const resString = Buffer.concat(body).toString()
        if (res.statusCode < 200 || res.statusCode > 299) {
          reject(new Error(`HTTP status code ${res.statusCode} with Response: ${resString}` ))
        } else {
          resolve(resString);
        }
        
      })
    })

    req.on('error', (err) => {
      reject(err)
    })

    req.on('timeout', () => {
      req.destroy()
      reject(new Error('Request time out'))
    })

    console.log('POSTING: ');
    console.log(dataString);
    req.write(dataString)
    req.end()
  })
}