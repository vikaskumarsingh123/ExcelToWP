import { DynamoDBClient, BatchWriteItemCommand } from "@aws-sdk/client-dynamodb";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import {
  DynamoDBDocumentClient,
  ScanCommand,
  GetCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const uploadStatus = Object.freeze({
  NOT_STARTED: 0,
  PROCESSING: 1,
  FAILED: 2,
  SUCCESS: 3
});

/**
 * Takes a resource in the IResource frontend interface and sets it up to be inserted/updated in the DynamoDB database in the variable type: value format
 */
function convertToDynamoDBItem ( newResource ) { //this must be the same as the dynamodb table format defined in the /aws_infra/template.yaml file
  return {
    pdfUrl: { S: newResource.pdfUrl},
    Title: { S: newResource.Title },
    Description: { S: newResource.Description },
    Status: { N: `${newResource.Status}` },
    batchId: { S: newResource.batchId },
    id: { S: newResource.id },
    WordpressLink: { S: '' },
    ErrorMesg: { S: '' }
  }
}


const SQS_client = new SQSClient({});
const ENTRIES_QUEUE_URL = process.env.ENTRIES_QUEUE_URL;

var dynamodb_options = {}; //the options to pass to our DB instance. Useful when doing local testing/debugging
if( process.env.AWS_SAM_LOCAL ) dynamodb_options = {
  region: 'localhost',
  endpoint: "http://dynamodb:8000"
 };


const client = new DynamoDBClient( dynamodb_options );

const dynamo = DynamoDBDocumentClient.from(client);

const tableName = "ExcelToWPEntries";

export const handler = async (event, context) => {
  let body;
  let statusCode = 200;
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Headers" : "Content-Type",
    "Access-Control-Allow-Origin": "*", // Allow from anywhere 
    "Access-Control-Allow-Methods": "*" // Allow all kinds of requests
  };

  try {
    switch (event.routeKey) {
      case "DELETE /items/{id}":
        await dynamo.send(
          new DeleteCommand({
            TableName: tableName,
            Key: {
              id: event.pathParameters.id,
            },
          })
        );
        body = `Deleted item ${event.pathParameters.id}`;
        break;
      case "GET /items/{id}":
        body = await dynamo.send(
          new GetCommand({
            TableName: tableName,
            Key: {
              id: event.pathParameters.id,
            },
          })
        );
        body = body.Item ?? 'No Item Found with the ID';
        break;
      case "OPTIONS /items":
        body = {success: true};
        break;
      case "GET /items":
        body = await dynamo.send(
          new ScanCommand({ TableName: tableName })
        );
        body = body.Items;
        break;
      case "PUT /items":
        let requestJSON = JSON.parse(event.body);
        let newResources = requestJSON.newResources ?? [];
        if(newResources.length > 0 ){
          var resourceEntries = newResources.map ( (newResource) => {
            return { PutRequest: { Item: convertToDynamoDBItem(newResource) } } ;
          });
          
          //put them into DynamoDB
          await dynamo.send(
            new BatchWriteItemCommand({ // batchwrite command documentation here: https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/dynamodb-example-table-read-write-batch.html
              RequestItems: {
                'ExcelToWPEntries': resourceEntries,
              },
            })
          );


          //put each of them into the SQS queue so the other lambda can process them and update db
          for (const newResource of newResources) {
            await SQS_client.send(
              new SendMessageCommand({
                QueueUrl: ENTRIES_QUEUE_URL,
                DelaySeconds: 10,
                MessageAttributes: {
                  id: {
                    DataType: "String",
                    StringValue: newResource.id,
                  },
                },
                MessageBody: JSON.stringify(newResource)
              })
            ) 
          }

          
          body = 'Put items in successfully and queued them up.';
        } else body = 'Failed to add resource - no resources provided';
        break;
      case "GET /items/batch/{batch_id}":
        body = await dynamo.send(
          new ScanCommand({
            TableName: tableName,
            FilterExpression:
              "batchId = :the_Batch_Id",
            ExpressionAttributeValues: {
              ":the_Batch_Id": event.pathParameters.batch_id
            },
          })
        );
        body = body.Items;
        break;
      default:
        console.log('Unsupported route');
        throw new Error(`Unsupported route: "${event.routeKey}"`);
    }
  } catch (err) {
    statusCode = 400;
    body = err.message;
    console.log(err.message);
  } finally {
    body = JSON.stringify(body);
  }

  return {
    statusCode,
    body,
    headers,
  };
};