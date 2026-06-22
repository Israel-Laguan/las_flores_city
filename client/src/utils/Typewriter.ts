export class Typewriter {
  private interval: number | null = null;
  private fullText: string = '';
  private currentCharIndex: number = 0;
  private skipRequested: boolean = false;
  private el: HTMLDivElement;
  private onFinish: () => void;
  private onChar?: (charIndex: number) => void;

  constructor(el: HTMLDivElement, onFinish: () => void, onChar?: (charIndex: number) => void) {
    this.el = el;
    this.onFinish = onFinish;
    this.onChar = onChar;
  }

  start(text: string) {
    this.fullText = text;
    this.currentCharIndex = 0;
    this.skipRequested = false;
    this.el.innerHTML = '';
    if (this.interval) clearInterval(this.interval);
    this.interval = window.setInterval(() => this.tick(), 30);
  }

  skip() {
    this.skipRequested = true;
  }

  clear() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    this.skipRequested = false;
  }

  private tick() {
    if (this.skipRequested || this.currentCharIndex >= this.fullText.length) {
      this.finish();
      return;
    }
    if (this.fullText[this.currentCharIndex] === '<') {
      const closingIndex = this.fullText.indexOf('>', this.currentCharIndex);
      if (closingIndex !== -1) this.currentCharIndex = closingIndex + 1;
    } else {
      this.currentCharIndex++;
      if (this.onChar) this.onChar(this.currentCharIndex);
    }
    this.el.innerHTML = this.fullText.substring(0, this.currentCharIndex);
  }

  private finish() {
    if (this.interval) { clearInterval(this.interval); this.interval = null; }
    this.el.innerHTML = this.fullText;
    this.onFinish();
  }
}
