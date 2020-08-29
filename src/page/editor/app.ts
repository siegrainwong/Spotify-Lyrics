import { html, GemElement } from '@mantou/gem/lib/element';
import { customElement, emitter, Emitter, refobject, RefObject } from '@mantou/gem/lib/decorators';

import { theme } from '../../common/theme';
import { audioPromise } from '../element';
import { sharedData } from '../share-data';
import { parseLyrics, Lyric } from '../lyrics';
import { setSong } from '../store';
import { OptionsAndI18n } from '../options';

import { Button } from './elements/button';

function removeEmptyLine(text: string) {
  return text.replace(/(\r?\n)\s*\1+/g, '$1');
}

function initLyrics(text: string) {
  return (
    parseLyrics(removeEmptyLine(text), {
      cleanLyrics: true,
      keepPlainText: true,
    }) || []
  );
}

function formatLRCTime(s: number) {
  const minStr = Math.floor(s / 60)
    .toString()
    .padStart(2, '0');
  const secStr = (s % 60).toFixed(2).padStart(5, '0');
  return `${minStr}:${secStr}`;
}

function serializedLyrics(lyric: Exclude<Lyric, null>) {
  let last = 0;
  return lyric
    .map(({ startTime, text }) => {
      last = startTime || last || 0;
      return `[${formatLRCTime(last)}] ${text}\n`;
    })
    .join('');
}

interface State {
  currentIndex: number;
  lyrics: Exclude<Lyric, null>;
}

@customElement('sl-ext-editor-app')
export class EditorApp extends GemElement<State> {
  @emitter close: Emitter;
  @refobject tbody: RefObject<HTMLTableSectionElement>;
  @refobject lyricsInput: RefObject<HTMLInputElement>;
  @refobject playbackRateInput: RefObject<HTMLInputElement>;

  originLyrics = sharedData.lyrics;
  originLoop = false;
  originPlaybackRate = 1;

  state: State = {
    currentIndex: -1,
    lyrics: this.originLyrics
      ? JSON.parse(JSON.stringify(this.originLyrics))
      : initLyrics(sharedData.text),
  };

  options: OptionsAndI18n;

  constructor(options: OptionsAndI18n) {
    super();
    this.options = options;
    this.addEventListener('keydown', (e: KeyboardEvent) => {
      e.stopPropagation();
    });
  }

  pasteHandler = async (e: ClipboardEvent) => {
    const lyrics = initLyrics(e.clipboardData?.getData('text') || '');
    this.resetLocal({ lyrics });
  };

  async mounted() {
    if (!document.pictureInPictureElement) return;
    this.resetLocal();

    const audio = await audioPromise;
    this.originLoop = audio.loop;
    audio.loop = true;
    this.originPlaybackRate = audio.playbackRate;

    document.addEventListener('paste', this.pasteHandler);
  }

  async unmounted() {
    const audio = await audioPromise;
    audio.loop = this.originLoop;
    audio.playbackRate = this.originPlaybackRate;
    document.removeEventListener('paste', this.pasteHandler);
    sharedData.lyrics = this.originLyrics;
  }

  changePlaybackRate = async () => {
    const { element } = this.playbackRateInput;
    if (!element) return;
    const audio = await audioPromise;
    audio.playbackRate = Number(element.value);
  };

  lyricsChange = () => {
    const file = this.lyricsInput.element?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.addEventListener('load', async (event) => {
      const lyrics = initLyrics(event.target!.result as string);
      this.resetLocal({ lyrics });
    });
    reader.readAsText(file);
  };

  scrollInto = () => {
    if (!this.tbody.element) return;
    const tr = [...this.tbody.element.querySelectorAll('tr.marked')].pop();
    tr?.scrollIntoView({
      behavior: 'smooth',
    });
  };

  mark = async () => {
    const audio = await audioPromise;
    const { lyrics, currentIndex } = this.state;
    this.scrollInto();
    lyrics[currentIndex + 1].startTime = audio.currentTime;
    this.setState({ lyrics, currentIndex: currentIndex + 1 });
    sharedData.lyrics = lyrics;
  };

  insertLine = async () => {
    const audio = await audioPromise;
    const { lyrics, currentIndex } = this.state;
    this.scrollInto();
    lyrics.splice(currentIndex + 1, 0, { startTime: audio.currentTime, text: '' });
    this.setState({ lyrics, currentIndex: currentIndex + 1 });
    sharedData.lyrics = lyrics;
  };

  removeLine = (index: number) => {
    const { lyrics } = this.state;
    lyrics.splice(index, 1);
    this.setState({ lyrics });
    sharedData.lyrics = lyrics;
  };

  resetLocal = async (state?: Partial<State>) => {
    const audio = await audioPromise;
    audio.currentTime = 0;
    this.setState({ ...state, currentIndex: -1 });
    setTimeout(this.scrollInto);
  };

  resetRemote = async () => {
    await setSong({
      name: sharedData.name,
      artists: sharedData.artists,
      lyric: '',
    });
    const lyrics = initLyrics(sharedData.text);
    this.resetLocal({ lyrics });
    sharedData.lyrics = lyrics;
  };

  saveRemote = async () => {
    const { lyrics } = this.state;
    const { i18nMap } = this.options;
    if (lyrics.some(({ startTime }) => startTime === null)) {
      return alert(i18nMap.pageEditorSaveValid);
    }
    await setSong({
      name: sharedData.name,
      artists: sharedData.artists,
      lyric: serializedLyrics(lyrics),
    });
    this.originLyrics = lyrics;
    this.close(null, { bubbles: true, composed: true });
  };

  download = () => {
    const link = document.createElement('a');
    const text = serializedLyrics(this.state.lyrics);
    const blob = new Blob([text], { type: 'text/plain' });
    link.href = URL.createObjectURL(blob);
    link.download = `${sharedData.name} - ${sharedData.artists}.lrc`;
    link.click();
  };

  jump = async (t: number | null, index: number) => {
    if (typeof t !== 'number') return;
    const audio = await audioPromise;
    audio.currentTime = t;
    this.setState({ currentIndex: index });
  };

  dragOver = (e: DragEvent) => {
    if (e.dataTransfer) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    }
  };

  pasteText = (e: ClipboardEvent) => {
    if (e.clipboardData) {
      e.stopPropagation();
      e.preventDefault();
      const text = e.clipboardData.getData('text/plain');
      document.execCommand('insertHTML', false, text);
    }
  };

  modifyLine = (e: InputEvent, index: number) => {
    this.state.lyrics[index].text = (e.target as HTMLTableCellElement).innerText;
  };

  render() {
    const { currentIndex, lyrics } = this.state;
    const { i18nMap } = this.options;
    if (!document.pictureInPictureElement) {
      return html`
        <style>
          :host {
            font-size: 1.5em;
            text-align: center;
            display: block;
            padding: 2em 1em 0;
            margin-bottom: 2em;
            color: rgb(${theme.blackRGB});
          }
        </style>
        ${i18nMap.pageEditorOpenValid}
      `;
    }
    return html`
      <style>
        :host {
          font-size: 1.3em;
          display: block;
          padding: 0.8em 1.6em 1.6em;
          color: rgb(${theme.blackRGB});
        }
        a,
        a:visited {
          color: inherit;
          text-decoration: none;
        }
        .title {
          font-size: 1.3em;
          margin: 0.5em 0;
        }
        .body {
          height: 70vh;
          overflow: auto;
          margin-bottom: 1em;
        }
        .body:focus {
          outline: rgba(${theme.blackRGB}, 0.075) auto 1px;
        }
        .tip {
          margin: 2em;
          text-align: center;
          opacity: 0.5;
        }
        .button:hover {
          cursor: pointer;
          border-bottom: 1px solid;
        }
        table {
          width: 100%;
          line-height: 1.5;
        }
        tr {
          opacity: 0.6;
        }
        td {
          padding: 0;
          vertical-align: baseline;
        }
        td:focus {
          outline: none;
        }
        .marked {
          opacity: 1;
        }
        .timestamp {
          font-feature-settings: 'tnum';
          user-select: none;
          width: 1px;
          padding-right: 1em;
          white-space: nowrap;
        }
        .remove {
          cursor: pointer;
          width: 1px;
          padding-left: 1em;
          opacity: 0.5;
        }
        .remove:hover {
          opacity: 1;
        }
        .placeholder {
          opacity: 0.5;
        }
        .timestamp:not(.placeholder) {
          cursor: pointer;
        }
        .btns {
          display: flex;
          justify-content: space-between;
        }
      </style>
      <p class="title">
        ${i18nMap.pageEditorTitle}:
        <a
          target="_blank"
          title=${i18nMap.pageEditorSearch}
          href="https://www.google.com/search?q=${sharedData.name} ${sharedData.artists} lyrics"
        >
          ${sharedData.name} - ${sharedData.artists}
        </a>
      </p>
      <p>
        ${i18nMap.pageEditorPlaybackRate}:
        <select ref=${this.playbackRateInput.ref} @change=${this.changePlaybackRate}>
          ${[0.5, 0.75, 1, 1.25, 1.5].map(
            (v) =>
              html`<option value=${v} ?selected=${this.originPlaybackRate === v}>${v}</option>`,
          )}
        </select>
      </p>
      <div class="body" tabindex="-1">
        <table>
          <tbody ref=${this.tbody.ref}>
            ${lyrics.map(
              ({ startTime, text }, index) => html`
                <tr class="${currentIndex >= index ? 'marked' : ''}">
                  <td
                    @click=${() => this.jump(startTime, index)}
                    title=${startTime === null ? '' : i18nMap.pageEditorSeek}
                    class="timestamp ${startTime === null ? 'placeholder' : ''}"
                  >
                    ${startTime === null ? '00:00.00' : formatLRCTime(startTime)}
                  </td>
                  <td
                    contenteditable
                    @dragover=${this.dragOver}
                    @paste=${this.pasteText}
                    @input=${(e: InputEvent) => this.modifyLine(e, index)}
                  >
                    ${text}
                  </td>
                  <td class="remove" @click=${() => this.removeLine(index)}>✕</td>
                </tr>
              `,
            )}
          </tbody>
        </table>
        ${lyrics.length === 0
          ? html`
              <p class="tip">
                ${i18nMap.pageEditorAddLyrics1}
                <label for="lyrics" class="button">${i18nMap.pageEditorAddLyrics2}</label>
                ${i18nMap.pageEditorAddLyrics3}
              </p>
            `
          : ''}
      </div>
      <input
        ref=${this.lyricsInput.ref}
        id="lyrics"
        @change=${this.lyricsChange}
        type="file"
        accept="text/plain"
        hidden
      />
      <div class="btns">
        ${new Button({ clickHandle: this.mark, content: i18nMap.pageEditorMarkLine })}
        ${new Button({ clickHandle: this.insertLine, content: i18nMap.pageEditorInsetLine })}
        ${new Button({ clickHandle: this.resetRemote, content: i18nMap.pageEditorReset })}
        ${new Button({ clickHandle: this.download, content: i18nMap.pageEditorDownload })}
        ${new Button({ clickHandle: this.saveRemote, content: i18nMap.pageEditorSave })}
      </div>
    `;
  }
}
