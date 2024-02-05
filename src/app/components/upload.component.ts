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
          console.log(res);
          for(var i = 0; i < this.newResources.length ; i++){
            this.newResources[i].Status = uploadStatus.PROCESSING;
          }
          this.batchProcessingStatus = uploadStatus.FAILED; //make our big Start Upload button be processing icon and disalbed for future clicks.
        } );
      }
      return true;
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



