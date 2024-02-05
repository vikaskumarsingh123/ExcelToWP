import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { RippleModule } from 'primeng/ripple';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ButtonModule, RippleModule, RouterLink, RouterLinkActive],
  templateUrl: './home.component.html',
})

export class HomeComponent {
  title : string = 'ExcelToWP';
  year : number = (new Date()).getFullYear();
}
