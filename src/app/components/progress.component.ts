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
  templateUrl: './progress.component.html',
})
@Injectable({providedIn: 'root'})
export class ProgressComponent {
    title : string = 'Progress of Uploads';
    resources: Array<IResource> = [];
    emptyResources : boolean = false;
    loadingResources : boolean = true; //it will start loading asap. This variable helps show a spinner until then.
    processingResources : boolean = false; //is set to true if all resources are currently processing. This way, you can cancel processing for all resources that are currently processing.

    constructor(private http: HttpClient){
      this.getResources();
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
     * getsTheResources the current resources to the Amazon API endpoint, where it is stored in our DynamoDB
     */
    getResources(){
      this.http.get<any>(APIGateway_base + 'items')
      .pipe(
        catchError( err => {
          throw 'Error with API. Details: ' + err;
        } )
      ).subscribe( (res) =>{
        this.resources = res;
        if(res.length < 1) this.emptyResources = true; //so we can show the message that no resources found.
        console.log(res);
      } )
      .add(() => {
        // Either fail or succeed
        this.loadingResources = false;
      } );
      return true;
    }

}



