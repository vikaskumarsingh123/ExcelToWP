import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  UpdateCommand
} from "@aws-sdk/lib-dynamodb";

import * as https from 'https';
import * as fs from 'fs';
import { wordpress_config } from "./credentials.mjs";
import { table } from "console";

const uploadStatus = Object.freeze({
  NOT_STARTED: 0,
  PROCESSING: 1,
  FAILED: 2,
  SUCCESS: 3
});

let buff = Buffer.from(wordpress_config.credentials);
var token = buff.toString('base64');


var dynamodb_options = {}; //the options to pass to our DB instance. Useful when doing local testing/debugging
if( process.env.AWS_SAM_LOCAL ) dynamodb_options = {
  region: 'localhost',
  endpoint: "http://dynamodb:8000"
 };


const client = new DynamoDBClient( dynamodb_options );

const dynamo = DynamoDBDocumentClient.from(client);

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
        console.log('Processing Record: ');
        console.log(record);
        var entry = JSON.parse(record.body);
        var entry_return_from_wp_api = JSON.parse(await processMessage(entry, context));
        body.successful.push( entry );

        //lets store in the database that this worked (or didn't)
        if( "link" in entry_return_from_wp_api) await updateDb( entry.id, uploadStatus.SUCCESS, entry_return_from_wp_api.link );
        else await updateDb( entry.id, uploadStatus.FAILED, '', 'Posting the resource to Wordpress API failed. Contact the developer!' );

    } catch (error) {
      //lets store in database that it did not work
        await updateDb( entry.id, uploadStatus.FAILED, '', String(error) );
        body.failed.push({ ...entry, errorMesg: error });
    }
  }
  
  console.log('Final result is:');
  console.log(body);
  
  body = JSON.stringify(body);

  return {
    statusCode,
    body,
    return_headers,
  };
};


/** 
* Process this message 
* @param {object} record - The data sent by the SQS queue
* @return {promises} Returns a promise that resolves to true or rejects to false.
*/
async function processMessage(newResource) {

    var wp_url = "https://" + wordpress_config.website_url + "/wp-json/wp/v2";
    var wp_post_url = wp_url + "/resource"
    var wp_media_url = wp_url + "/media"


    //lets upload the PDF file first
    if(newResource.pdfUrl != '' && newResource.pdfUrl != null){
      console.log("Downloading file...");
      newResource.pdfLocalUrl = await downloadFile(newResource.pdfUrl, 'resourcepdf.pdf');
      console.log("Uploading file to WP...");
      var pdf_upload_return = await uploadFileToWP(wp_media_url, newResource.pdfLocalUrl);
      console.log("PDF Upload Return says:");
      console.log(pdf_upload_return);
    }
    

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

    return return_from_api;
  
  
}

/** 
* Does a simple post request
* @param {string} url - The url to post to
* @param {object} data - The JSON data that has to be posted
* @return {promises} Returns a promise that resolves to true or rejects to false.
*/
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
          reject(new Error(`Could not publish the resource post to WordPress website. HTTP status code ${res.statusCode} with Response: ${resString}` ))
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
      reject(new Error('Request timed out'))
    })

    console.log('POSTING: ');
    console.log(dataString);
    req.write(dataString)
    req.end();
  })
}


/** 
* Does a simple file post request
* @param {string} url - The url to post to
* @param {string} file_local_url - The local url of the file
* @return {promises} Returns a promise that resolves to true or rejects to false.
*/
function uploadFileToWP(url, file_local_url) {

  var stream = fs.createReadStream(file_local_url);
  const file_size = (fs.statSync(file_local_url)).size;
  console.log('The file has size ' + file_size + ' bytes');

  const options = {
    method: 'POST',
    headers: {
      'Content-Disposition': 'form-data; filename="resource.pdf"',
      'Content-Length': file_size,
      'Authorization': 'Basic ' + token,
      'Content-type': 'application/pdf'
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
          reject(new Error(`Could not upload the file (${file_local_url}) to the WordPress website. HTTP status code ${res.statusCode} with Response: ${resString}` ))
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
      reject(new Error('File upload request timed out'))
    })

    console.log('Uploading file ' + file_local_url);
    
    //control the post request through the file stream
    stream.on('data', function(data) {
      req.write(data);
    });
    stream.on('end', function() {
      req.end();
    });
    
  })
}


/** 
* Download the PDF or word document
* @param {string} file_url - The publically available link to download the file.
* @param {string} default_file_name - The name of the pdf or word file if it cannot determine name by itself.
* @return {promise} With success giving the link of the file or empty string if it fails
*/
async function downloadFile(file_url, default_file_name){

  //lets determine filename
  var file_name = default_file_name; //set it to the default and then see if we can improve upon it
  try {
    file_name = new URL(file_url).pathname.split('/').pop();
  } catch (e) {
    console.error('Could not determine filename, so using the default one');
    console.error(e);
    file_name = default_file_name;
  }
  const dest = '/tmp/' + file_name;


  return new Promise((resolve, reject) => {
    const req = https.get(file_url, (res) => {
      
      const file = fs.createWriteStream(dest);
      res.pipe(file);      

      file.on('finish', () => {
          file.close(); 
          resolve(dest);
      })

    })

    req.on('error', (err) => {
      reject(err)
    })

    req.on('timeout', () => {
      fs.unlink(dest);
      req.destroy();
      reject(new Error('File download request timed out'))
    })

  });
}


/** 
* Sets a new status integer for the resource in question.
* @param {string} resource_id - This is the id of the resource entry in the dynamodb table you wish to update
* @param {uploadStatus} status - The new status that you would like that resource to have. It is a type of uploadStatus class.
* @param {string} post_url - The direct link of the post.
* @param {string} errorMesg - Any error message you would like to store for this entry
* @return {promises} Returns a promise that resolves to True or rejects to false.
*/
async function updateDb(resource_id, status, post_url, errorMesg = '' ){
  try{
    const command = new UpdateCommand({
      TableName: tableName,
      Key: {
        id: resource_id,
      },
      UpdateExpression: "set #resource_status = :status , WordpressLink = :post_url , ErrorMesg = :errorMesg",
      ExpressionAttributeValues: {
        ":status": status,
        ":post_url": post_url,
        ":errorMesg": errorMesg,
      },
      ExpressionAttributeNames: {
        "#resource_status": "Status"
      },
      ReturnValues: "NONE", //we dont really need to see what it affected
    });

    const response = await dynamo.send(command);
    console.log(response);
  } catch(error){
    console.log(error);
  }
  return true;
}