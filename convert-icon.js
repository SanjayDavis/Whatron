const toIco = require('to-ico');
const fs = require('fs');

const files = [
  fs.readFileSync('icon_upscaled.png')
];

toIco(files, { sizes: [16, 24, 32, 48, 64, 128, 256] })
  .then(buf => {
    fs.writeFileSync('icon.ico', buf);
    console.log('✅ Successfully converted icon_upscaled.png to icon.ico with multiple sizes');
  })
  .catch(err => {
    console.error('❌ Error converting icon:', err);
  });
