import { imFellEnglishLicence, jetBrainsMonoLicence } from "../fonts/licences";

export function FontLicences() {
  return (
    <details>
      <summary>Font licences</summary>
      <h2>IM Fell English</h2>
      <pre>{imFellEnglishLicence}</pre>
      <h2>JetBrains Mono</h2>
      <pre>{jetBrainsMonoLicence}</pre>
    </details>
  );
}
