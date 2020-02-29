import { css } from './utils';

// remove AD
const style = document.createElement('style');
style.innerHTML = css`
  .NavBar__download-item,
  [role='banner'],
  [role='main'] ~ div {
    display: none;
  }
`;
document.head.append(style);

// Add PWA support
navigator.serviceWorker.getRegistration().then(reg => {
  if (!reg) {
    navigator.serviceWorker.register('https://open.spotify.com/service-worker.js').then(() => {
      console.log('sw register success!');
    });
  }
});
