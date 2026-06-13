import { platformBrowserDynamic } from '@angular/platform-browser-dynamic';
import { Capacitor } from '@capacitor/core';
import { AppModule } from './app/app.module';

async function bootstrap() {
  // jeep-sqlite is only needed on web — on native platforms the
  // @capacitor-community/sqlite plugin uses native SQLite directly.
  if (Capacitor.getPlatform() === 'web') {
    // Dynamically load the jeep-sqlite web component
    const script = document.createElement('script');
    script.type = 'module';
    script.src = 'jeep/jeep-sqlite.esm.js';
    document.head.appendChild(script);

    const el = document.createElement('jeep-sqlite');
    el.setAttribute('wasm-path', '/jeep');
    el.style.display = 'none';
    document.body.appendChild(el);

    if (typeof customElements !== 'undefined') {
      await customElements.whenDefined('jeep-sqlite');
    }
  }

  return platformBrowserDynamic().bootstrapModule(AppModule);
}

bootstrap().catch(err => console.log(err));
