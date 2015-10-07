var file = "testData.png";

const TRANSPARENT_COLOR = {r: 0, g: 255, b: 0};

let canvasCache = {};
let imageCache = {};
let pixelFunctionCache = {};
let pixelCache = {};
let srcCanvas = document.createElement("canvas");

export function getCorrectedBmpImage(canvasElement, filename) {
    if (pixelCache[filename]) {
        canvasElement.width = imageCache[filename].width;
        canvasElement.height = imageCache[filename].height;
        canvasElement.getContext("2d").putImageData(pixelCache[filename],0,0);
        return;
    }
    pixelFunctionCache[filename] = pixelFunctionCache[filename]  || [];
    pixelFunctionCache[filename].push(function(pixels) {
        canvasElement.width = imageCache[filename].width;
        canvasElement.height = imageCache[filename].height;
        canvasElement.getContext("2d").putImageData(pixels,0,0)
    });

    if (imageCache[filename]) {
        return;
    }
    var img = imageCache[filename] = new Image();
    img.src = filename;
    img.onload = afterLoad;

    // // write pixel data to destination context
    // dstContext.putImageData(pixels,0,0);

    return; // Helper functions:
    function afterLoad() { // Compute the new pixels:
        // create a source canvas. This is our pixel source
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;

        // append the canvas elements to the container

        // get context to work with
        var srcContext = srcCanvas.getContext("2d");

        // draw the loaded image on the source canvas
        srcContext.drawImage(img, 0, 0);

        // read pixels from source
        var pixels = srcContext.getImageData(0, 0, img.width, img.height);

        // iterate through pixel data (1 pixels consists of 4 ints in the array)
        for(var i = 0, len = pixels.data.length; i < len; i += 4){
            var r = pixels.data[i];
            var g = pixels.data[i+1];
            var b = pixels.data[i+2];

            // if the pixel matches our transparent color, set alpha to 0
            if(r == TRANSPARENT_COLOR.r && g == TRANSPARENT_COLOR.g && b == TRANSPARENT_COLOR.b){
                pixels.data[i+3] = 0;
            }
        }

        for (let func of pixelFunctionCache[filename] || []) {
            func(pixels);
        }
        pixelCache[filename] = pixels;
        pixelFunctionCache[filename] = [];
    }
}
