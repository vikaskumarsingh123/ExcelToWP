import { Component, Injectable } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';
import { FileUploadModule } from 'primeng/fileupload';
import { TableModule } from 'primeng/table';
import { DividerModule } from 'primeng/divider';
import { ScrollPanelModule } from 'primeng/scrollpanel';
import { read, utils } from "xlsx";
import { GuidGenerator } from './GuidGenerator';
import { HttpClient } from '@angular/common/http';
import { catchError } from 'rxjs';
import { uploadStatus } from './uploadStatus';
import { APIGateway_base } from './APIGateway_base';
import { IResource } from './IResource';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ButtonModule, RippleModule, RouterLink, RouterLinkActive, FileUploadModule, TableModule, DividerModule,ScrollPanelModule],
  templateUrl: './upload.component.html',
})
@Injectable({providedIn: 'root'})
export class UploadComponent {
    title : string = 'Upload a file';
    maxFileSizeInBytes : number = 1000000;
    reader :FileReader;
    newResources: Array<IResource> = [];
    showFileSelect: boolean = true;
    batchGUID = GuidGenerator.newGuid();
    batchProcessingStatus = uploadStatus.NOT_STARTED; //follows the same status as individual resources
    watchProgressInterval : ReturnType<typeof setInterval> = setTimeout( () => null , 1); //this interval is created after the resources are uploaded and is used to fetch the progress of the upload.


    constructor(private http: HttpClient){
      this.reader = new FileReader();
      this.reader.onload = () => this.extractResources(this.reader.result)
    }



    getStatusIconClass( currentStatus : number ) : string{
      switch(currentStatus){
        case uploadStatus.NOT_STARTED : return 'pi-cloud-upload';
        case uploadStatus.PROCESSING : return 'pi-spin pi-spinner';
        case uploadStatus.FAILED : return 'pi-exclamation-circle';
        case uploadStatus.SUCCESS : return 'pi-check-circle';
        default: return 'pi-upload';
      }
    }



    /**
     * AWHN put keywords in the description at the end of it, so we extract it from there and then inject it back into our object of the new resource.
     */
    extractKeywordsFromDesc( desc : string ) : string{
      let keywords : string = '';
      if(desc.includes('Keywords:')){
        let keywords_arr : Array<string> = [];
        keywords_arr = desc.split('Keywords:');
        keywords = (keywords_arr.splice(-1))[0]; //get the last part of the array
      }
      return keywords;
    }



    /**
     * AWHN put keywords in the description at the end of it, so we extract just the description from there and then inject it back into our object of the new resource.
     * Complements the above function
     */
    extractContentFromDesc( desc : string ) : string{
      let keywords : string = desc;
      if(desc.includes('Keywords:')){
        let keywords_arr : Array<string> = [];
        keywords_arr = desc.split('Keywords:');
        keywords = keywords_arr[0]; //get the first part of the array
      }
      return keywords;
    }



    /**
     * Pushes the current resources to the Amazon API endpoint, where it is stored in our DynamoDB, then queued in an SQS where it is picked up by a Lambda function that processes it (process-entries.mjs file).
     */
    uploadResources(){
      
      //lets make all of them processing status, so that the correct status gets passed on to the API and reflects here on frontend
      for(var i = 0; i < this.newResources.length ; i++){
        this.newResources[i].Status = uploadStatus.PROCESSING;
      }
      if( this.batchProcessingStatus != uploadStatus.PROCESSING ){ //only do things if not already doing things
        this.http.put<any>(APIGateway_base + 'items', {newResources : this.newResources})
        .pipe(
          catchError( err => { 
            for(var i = 0; i < this.newResources.length ; i++){
              this.newResources[i].Status = uploadStatus.FAILED;
            }
            this.batchProcessingStatus = uploadStatus.FAILED;
            throw 'Error with API. Details: ' + err;
          } )
        ).subscribe( (res) =>{
          this.batchProcessingStatus = uploadStatus.PROCESSING; //make our big Start Upload button be processing icon and disalbed for future clicks.
          this.watchProgressInterval = setInterval( this.watchProgress.bind(this), 1500); //start watching for progress by reading status on the API.
        } );
      }
      return true;
    }


    /**
     * Starts watching for progress by reading the API
     */
    watchProgress(){
      this.http.get<any>(APIGateway_base + 'items/batch/' + this.batchGUID)
      .pipe(
        catchError( err => {
          this.batchProcessingStatus = uploadStatus.FAILED;
          throw 'Error with API. Details: ' + err;
        } )
      ).subscribe( (res) =>{
        console.log(`Length of new resources is currently ${this.newResources.length}`);
        for(var i = 0; i < this.newResources.length ; i++){
          var matched_resource_from_API = res.find( (res_single: { id: any; }) => res_single.id == this.newResources[i].id );
          this.newResources[i].Status = matched_resource_from_API.Status; 
          this.newResources[i].ErrorMesg = matched_resource_from_API.ErrorMesg; 
          this.newResources[i].WordpressLink = matched_resource_from_API.WordpressLink; 
          console.log(`Status for ${this.newResources[i].Title} is ${this.newResources[i].Status}`);
        }

         //lets check if none of the resources are in processing state (so either failed or successful)
         var filtered_res = this.newResources.filter( (res) => res.Status == uploadStatus.PROCESSING );
         console.log(filtered_res);
         if(filtered_res.length == 0){
           console.log('Processing finished for all resources, stopping polling API for progress.');
           clearInterval(this.watchProgressInterval);
           this.batchProcessingStatus = uploadStatus.SUCCESS;
         }

      } )
    }





    /**
     * Fired on the selection of a new file, and then passes on control to the extractResources function
     */
    processFile(event: any){
      console.log('Received file, now analysing it...', event);
      //initiate the file reading
      this.reader.readAsArrayBuffer(event.files[0]);
    }



    /**
     * Understand what resources exist inside the excel file
     */
    extractResources( localArrayBuffer : ArrayBuffer | string | null ){

      if(localArrayBuffer instanceof ArrayBuffer){ //we will not be processing strings here sire
        const wb = read(localArrayBuffer);

        /* generate array of objects from first worksheet */
        const ws = wb.Sheets[wb.SheetNames[0]]; // get the first worksheet
        const data = utils.sheet_to_json<IResource>(ws); // generate objects

        /* update data */
        
        this.newResources = data.map( (dat) => ({...dat, 
          Status: uploadStatus.NOT_STARTED,  //we use status to tell if the resource is uploaded. 0 = not started
          batchId: this.batchGUID,
          Keywords: this.extractKeywordsFromDesc(dat.Description),
          Description: this.extractContentFromDesc(dat.Description),
          id: GuidGenerator.newGuid()
        }) ); 
        
        //now hide the file selector
        this.showFileSelect = false;
      }
      
    }

}



