import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { AppModule } from './app/app.module';

async function bootstrap() {
  if (typeof customElements !== 'undefined') {
    await customElements.whenDefined('jeep-sqlite');
  }

  const el = document.querySelector('jeep-sqlite');
  if (!el) {
    const newEl = document.createElement('jeep-sqlite');
    newEl.style.display = 'none';
    document.body.appendChild(newEl);
  }

  return platformBrowserDynamic().bootstrapModule(AppModule);
}

bootstrap().catch(err => console.log(err));
