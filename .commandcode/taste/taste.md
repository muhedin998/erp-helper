# Taste (Continuously Learned by [CommandCode][cmd])

[cmd]: https://commandcode.ai/

# architecture
- Application must work fully offline — avoid runtime dependencies on external CDN scripts, remote APIs, or internet connectivity. Confidence: 0.85
- Import jeep-sqlite as a side-effect in main.ts before Angular bootstrap, await customElements.whenDefined('jeep-sqlite'), then create the element programmatically — do not rely on &lt;script type="module"&gt; in index.html due to race conditions with Angular's bootstrap timing. Confidence: 0.75

# workflow
- Use Chrome DevTools to verify the app actually works before reporting success — don't rely solely on build output or console logs to confirm functionality. Confidence: 0.65
