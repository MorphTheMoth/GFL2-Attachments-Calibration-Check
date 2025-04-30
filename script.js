const pasteRight = document.getElementById('pasteRight')
const fileInput = document.getElementById('fileInput')
const canvas = document.getElementById('canvas')
const output = document.getElementById('output')
const ctx = canvas.getContext('2d')
const HISTORY_LIMIT = 10
const MIN_STREAK_LENGTH = 50
const MAX_TOLERANCE_PIXELS = 10   //how many pixels in a row can be wrong before stopping the orange line
const PERCENT_ERROR_TOLERANCE = 1 //how close can it be to xx5% to give a warning
let history = JSON.parse(localStorage.getItem('calibrationHistory')) || []

//data from https://colab.research.google.com/drive/11G6t0H3UMILEE26mEkgpP4Vi8AKy4blh
const db = {
    "lines_3": {
        "value": [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59],
        "calibrations": [6, 6, 6, 6, 6, 7, 7, 8, 9, 10, 11, 13, 16, 19, 24, 30, 39, 52, 72, 100, 146, 224, 342, 550, 843, 1592, 3165, 6250, 13514, 31250],
        "gold": ["120k", "120k", "120k", "120k", "120k", "140k", "140k", "160k", "180k", "200k", "220k", "260k", "320k", "380k", "480k", "600k", "780k", "1m", "1.4m", "2m", "2.9m", "4.5m", "6.8m", "11m", "16.9m", "31.8m", "63.3m", "125m", "270.3m", "625m"]
    },
    "lines_4": {
        "value": [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50, 51, 52, 53, 54, 55, 56, 57, 58, 59, 60, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 76, 77],
        "calibrations": [11, 11, 11, 11, 11, 11, 12, 12, 13, 13, 14, 16, 17, 19, 22, 25, 29, 36, 43, 53, 68, 87, 117, 148, 210, 293, 427, 574, 885, 1389, 2203, 3165, 4808, 10204, 17241, 35714, 62500, 166667],
        "gold": ["220k", "220k", "220k", "220k", "220k", "220k", "240k", "240k", "260k", "260k", "280k", "320k", "340k", "380k", "440k", "500k", "580k", "720k", "860k", "1.1m", "1.4m", "1.7m", "2.3m", "3m", "4.2m", "5.9m", "8.5m", "11.5m", "17.7m", "27.8m", "44.1m", "63.3m", "96.2m", "204.1m", "344.8m", "714.3m", "1.2b", "3.3b"]
    }
}

function isColorSimilar(r, g, b, color) {
    let tolerance = 0.05
    let targetColors = {
        'white': [0xEF, 0xEF, 0xEF],
        'orange': [0xF3, 0x6C, 0x1C]
    }
    let [tr, tg, tb] = targetColors[color]
    return (
        Math.abs(r - tr) <= 255 * tolerance &&
        Math.abs(g - tg) <= 255 * tolerance &&
        Math.abs(b - tb) <= 255 * tolerance
    )
}

function processImage(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
        const dataUrl = e.target.result
        const img = new Image()
        img.onload = () => processImageData(img, dataUrl, { saveToHistory: true })
        img.src = dataUrl
    }
    reader.readAsDataURL(file)
}

function toggleHistory() {
    const content = document.getElementById('historyContent')
    const historySection = document.querySelector('.history-section')
    const isOpen = content.style.display === 'grid'
    content.style.display = isOpen ? 'none' : 'grid'
    historySection.classList.toggle('expanded', !isOpen)
}

function clearHistory() {
    if (confirm('Clear all history?')) {
        history = []
        localStorage.setItem('calibrationHistory', JSON.stringify(history))
        renderHistory()
    }
}

function renderHistory() {
    const container = document.getElementById('historyContent')
    if (history.length === 0)
        container.innerHTML = 'Empty'
    else
        container.innerHTML = history.map((entry, index) => `
      <div class="history-item">
        <img src="${entry.image}" class="history-thumbnail"
             onclick="processImageFromHistory('${entry.image}')">
        <div>${entry.total}%</div>
      </div>
    `).join('')
}

function processImageFromHistory(dataUrl) {
    const historySection = document.querySelector('.history-section');
    const scrollYBefore = window.scrollY;
    const historyRectBefore = historySection.getBoundingClientRect();

    const img = new Image();
    img.onload = () => {
        processImageData(img, dataUrl, { saveToHistory: false });
        const historyRectAfter = historySection.getBoundingClientRect();
        const positionChange = Math.round(historyRectAfter.top - historyRectBefore.top);
        window.scrollTo({
            top: scrollYBefore + positionChange,
            behavior: 'auto'
        });
    };
    img.src = dataUrl;
}

window.addEventListener('paste', (event) => {
    let items = (event.clipboardData || event.originalEvent.clipboardData).items
    for (let item of items)
        if (item.type.indexOf('image') === 0) {
            processImage(item.getAsFile())
            break
        }
})

document.addEventListener('DOMContentLoaded', renderHistory)
pasteRight.addEventListener('click', () => fileInput.click())
fileInput.addEventListener('change', (e) => {
    if (fileInput.files.length > 0)
        processImage(fileInput.files[0])
})

function processImageData(img, dataUrl, options = {}) {
    const { saveToHistory = false } = options;
    canvas.width = img.width
    canvas.height = img.height

    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    const imgData = ctx.getImageData(0, 0, img.width, img.height).data
    let total = 0
    let whiteStartX = -1
    let whiteLength = 0
    let orangeStartX = -1
    let orangeLength = 0
    let wrongPixels = 0

    let outputText = ""
    let isPreviousLineWhite = false
    let attachmentLineNum = 0

    for (let y = 0; y < img.height; y++) {
        maxWhiteBarX = -1
        whiteStartX = -1
        whiteLength = 0
        orangeStartX = -1
        orangeLength = 0
        wrongPixels = 0

        for (let x = 0; x < img.width; x++) {
            const imgIndex = (y * img.width + x) * 4
            const r = imgData[imgIndex]
            const g = imgData[imgIndex + 1]
            const b = imgData[imgIndex + 2]

            if (isColorSimilar(r, g, b, 'white')) {
                if (whiteStartX === -1)
                    whiteStartX = x
                if (orangeStartX != -1)
                    maxWhiteBarX = x
                if (whiteStartX + whiteLength === x)
                    whiteLength++
            }

            if (whiteLength < MIN_STREAK_LENGTH || wrongPixels >= MAX_TOLERANCE_PIXELS) continue
            if (orangeStartX === -1)
                if (isColorSimilar(r, g, b, 'orange'))
                    orangeStartX = x
                else continue

            orangeLength++
            if (isColorSimilar(r, g, b, 'orange')) {
                wrongPixels = 0
            } else if (wrongPixels < MAX_TOLERANCE_PIXELS) {
                wrongPixels++
            }
        }

        if (whiteLength >= MIN_STREAK_LENGTH && orangeLength > MAX_TOLERANCE_PIXELS) {
            if (isPreviousLineWhite) continue
            isPreviousLineWhite = true

            orangeLength += -wrongPixels
            whiteLength += 0
            let exactPercent = orangeLength > 0 ? ((orangeLength) / (whiteLength)) * 100 : 0
            let roundedPercent = Math.round(exactPercent / 10) * 10
            console.log(`white ${whiteLength}, orange ${orangeLength}, ${exactPercent.toFixed(1)}%`);
            total += roundedPercent

            outputText += `${++attachmentLineNum}  -  `
            if (orangeLength > 0) {
                if (Math.abs(exactPercent - roundedPercent) > 5 - PERCENT_ERROR_TOLERANCE)
                    outputText += `${roundedPercent}% (${exactPercent.toFixed(1)}%, might be ${exactPercent - roundedPercent > 0 ? Math.ceil(exactPercent / 10) * 10 : Math.floor(exactPercent / 10) * 10}%)\n\n`
                else
                    outputText += `${roundedPercent}%\n\n`//  -  ${(whiteLength/(maxWhiteBarX-whiteStartX)*100).toFixed(1)}%\n\n`
            } else
                outputText += `No orange line found.\n\n`

            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'purple';
            ctx.moveTo(--whiteStartX, y + 12);
            ctx.lineTo(whiteStartX + whiteLength, y + 12);
            ctx.stroke();
            ctx.beginPath();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'white';
            ctx.moveTo(whiteStartX + whiteLength, y + 12);
            ctx.lineTo(whiteStartX + whiteLength + orangeLength, y + 12);
            ctx.stroke();
        } else {
            isPreviousLineWhite = false
        }
    }

    let dbText = ''
    if (attachmentLineNum === 3 || attachmentLineNum === 4) {
        let data = db[`lines_${attachmentLineNum}`]
        let dbIndex = data.value.indexOf(total / 10)
        if (dbIndex != -1)
            dbText = `  -  Average Gold: ${data.gold[dbIndex]}`
    }
    document.getElementById('content').style.display = "flex"
    document.getElementsByClassName('history-section')[0].style.position = "static"
    if (attachmentLineNum === 0)
        output.innerText = 'Cant find anything, the image is probably too blurry'
    else
        output.innerText = outputText + `Total  -  ${total}%` + dbText

    if (saveToHistory) {
        const historyEntry = { image: dataUrl, total: total }
        history.unshift(historyEntry)
        if (history.length > HISTORY_LIMIT) history.pop()
        localStorage.setItem('calibrationHistory', JSON.stringify(history))
        renderHistory()
    }
}
