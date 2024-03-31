const child_process = require("node:child_process");
const fs = require('node:fs');
const path = require("node:path");
const { exit } = require("node:process");

const readline = require('node:readline').createInterface({
    input: process.stdin,
    output: process.stdout,
});

const getCloudFormationOuputValue = (stack_name,key) => {
  var command = `aws cloudformation describe-stacks --stack-name ${stack_name} --no-paginate --no-cli-pager --output text --query "Stacks[0].Outputs[?OutputKey=='${key}'].OutputValue"`;
    var ret = child_process.execSync(command, {encoding: 'utf8', maxBuffer: 500 * 1024 * 1024 });
  return ret.trim();
  
};

const deployAwsStack = (stack_name) => {
    console.log(`Deploying AWS infrastructure/stack using sam deploy.`);
    const command = `sam deploy --stack-name ${stack_name} --no-fail-on-empty-changeset --on-failure DELETE`;
    child_process.execSync(command, { stdio: "inherit", cwd: path.resolve(path.join(__dirname, "/aws_infra/")) });
};

const setCorrectApiBase = (stack_name) => {
  const APIGateway_base = getCloudFormationOuputValue(stack_name,"ApiEndpoint");
  const content_to_write = `export const APIGateway_base = '${APIGateway_base}';`;
  fs.writeFileSync('./src/app/components/APIGateway_base.ts', content_to_write, err => {
    if (err) {
      console.error(err);
      exit(2);
    } else {
      console.log('Wrote the correct api base url to the ./src/app/components/APIGateway_base.ts file');
    }
  });
};

const buildNG = () => {
  console.log(`Building Angular using ng build.`);
  const command = `ng build`;
  child_process.execSync(command, { stdio: "inherit" });
};


const uploadFiles = (stack_name) => {
  const sourceDir = path.resolve(path.join(__dirname, "/dist/excel-to-wp/browser"));
  const s3BucketName = getCloudFormationOuputValue(stack_name,"WebAppS3BucketName");
    if(s3BucketName == '' || s3BucketName === null){
        console.log("Could not retrieve name of bucket from the cloud stack.")
        exit(1);
    } 
  console.log(`Uploading files from ${sourceDir} to s3://${s3BucketName}`);
  child_process.execSync(`aws s3 sync "${sourceDir}" s3://${s3BucketName}`, { stdio: "inherit" });
};



const clearCloudFrontCache = (stack_name) => {
  const distributionId = getCloudFormationOuputValue(stack_name,"CloudFrontDistributionId");
  console.log(`Clearing CloudFront cache for distribution ${distributionId}`);

  const command = `
    aws cloudfront create-invalidation \
        --no-paginate \
        --no-cli-pager \
        --paths "/*" \
        --distribution-id ${distributionId}
    `;
    
  child_process.execSync(command, { stdio: "inherit" });
};

console.log("Before using this tool, please ensure you are already authenticated to your AWS CLI using aws sso login or aws sso configure.");
console.log("What this deploy script does is create the relevant cloud stack as defined in the aws_infra/template.yaml SAM file, build the angular application using ng build, and upload it to the S3 bucket created in the cloud stack.");

readline.question(`Please enter a name for the stack to be created on AWS (only lowercase allowed) [exceltowp]: `, stack_name => {
    stack_name = stack_name || 'exceltowp';
    console.log(`Stack name to be created is ${stack_name}. Proceeding...`);
    readline.close();

    try{
        deployAwsStack(stack_name);
        setCorrectApiBase(stack_name);
        buildNG();
        uploadFiles(stack_name);
        clearCloudFrontCache(stack_name); 

        const domain = getCloudFormationOuputValue(stack_name,"WebAppDomain");
        console.log(`Deployment done, the tool is available on https://${domain}. Please ensure you put this manually link in the wp-plugin PHP file.`);
    } catch{
        console.log(`Something went wrong! Please have a look at the console log above.`);
    }

});


