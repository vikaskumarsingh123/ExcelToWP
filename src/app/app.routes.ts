import { Routes } from '@angular/router';
import {UploadComponent} from './components/upload.component';
import {HomeComponent} from './components/home.component';
import {ProgressComponent} from './components/progress.component';

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'upload', component: UploadComponent },
    { path: 'progress', component: ProgressComponent }
];
