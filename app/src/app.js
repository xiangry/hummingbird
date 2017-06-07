var fs = require("fs");
var path = require('path');

const {ipcRenderer} = require('electron')
const imagemin = require('imagemin');
const imageminPngquant = require('imagemin-pngquant');
const imageminOptipng = require('imagemin-optipng');
const imageminJpegtran = require('imagemin-jpegtran');
const imageminSvgo = require('imagemin-svgo');
const imageminGifsicle = require('imagemin-gifsicle');
const imageminWebp = require('imagemin-webp');
const imageminMozjpeg = require('imagemin-mozjpeg');
var gulp = require('gulp');
var htmlmin = require('gulp-htmlmin');
var uglify = require('gulp-uglify');
var rename = require("gulp-rename");
var cleanCSS = require('gulp-clean-css');

var Pie = require("./components/pie/index.js");
var jpgValue, webpValue, shareCount, shareSize;

ipcRenderer.on('quality', function(e, arg1, arg2) {
    jpgValue = arg1;
    webpValue= arg2;
});

function App(el,options) {
    this.$el = $(el);
    this.options = options;
    this.status = "waiting";
    this.filesArray = [];
    this.diff = 0;
    this.statusHtml = {
        waiting: '<div class="ui-area-tip ui-area-waiting"></div>',
        drop: '<div class="pie" id="pie">\
            <div class="pie-progress">\
                <div class="pie-progress-fill"></div>\
            </div>\
        </div>\
        <p class="ui-area-tip ui-area-progress pie-percent"></p>'
    }
    this._init();
}
App.prototype = {
    _init: function() {
        var self = this;
        self._updateState();
        self.$el.find(".ui-area-waiting").html("将图形文件拖放至此");
        this.$el.on("dragenter", ".ui-area-drop", function(e) {
            e.preventDefault();
            $(this).addClass("ui-area-drop-have");
            self.$el.find(".ui-area-waiting").html("松开鼠标,就开始处理了");
        });
        this.$el.on("dragleave", ".ui-area-drop", function(e) {
            e.preventDefault();
            $(this).removeClass("ui-area-drop-have");
            self.$el.find(".ui-area-waiting").html("将图形文件拖放至此");
        });
        this.$el.on("drop", ".ui-area-drop", function(e) {
            $(this).removeClass("ui-area-drop-have");
            self.filesArray = [];
            self.diff = 0;
            self._filterFiles(e.originalEvent.dataTransfer.files);
            if (self.filesArray.length <= 0) {
                self.$el.find(".ui-area-waiting").html("将图形文件拖放至此");
                return false;
            };
            self.status = "drop";
            self._updateState();
            self._delFiles(self.filesArray);
        });
    },
    _filterFiles: function(files) {
        for (var i = 0; i < files.length; i++) {
            var file = files[i];
            console.log(file.type)
            if (file.type.indexOf("image") === -1&&file.type.indexOf("css") === -1&&file.type.indexOf("x-js") === -1&&file.type.indexOf("html") === -1) {
                continue;
            }
            this.filesArray.push({
                size: file.size,
                name: file.name,
                path: file.path,
                type: file.type
            });
        }
    },
    _delFiles: function() {
        var pie = new Pie(),
            index = 0,
            self = this,
            len = self.filesArray.length;
        pie.set(0);
        (function filesHandle() {
            var filePath = self.filesArray[index].path,
                fileDirname = path.dirname(filePath),
                fileBasename = path.basename(filePath),
                fileSourcePath = path.join(fileDirname, 'source', fileBasename);
            //mkdir
            self._mkdirSync(path.join(fileDirname, 'source'));
            //writeFile
            if (self.filesArray[index].type.indexOf("image") > -1){
                !fs.existsSync(fileSourcePath) && fs.writeFileSync(fileSourcePath, fs.readFileSync(filePath));
            } else {
                fs.writeFileSync(fileSourcePath, fs.readFileSync(filePath));
            }
            
            switch (self.filesArray[index].type) {

                case "image/svg+xml":
                    imagemin([filePath], fileDirname, {
                        plugins: [
                            imageminSvgo({})
                        ]
                    }).then(files => {
                        runThen(files);
                    });
                    break;
                case "image/jpeg":
                    imagemin([filePath], fileDirname, {
                        plugins: [
                            imageminJpegtran({progressive: true}),
                            imageminMozjpeg({
                                tune: 'psnr',
                                quality: jpgValue || 85
                            })
                        ]
                    }).then(files => {
                        runThen(files);
                    });
                    break;
                case "image/png":
                    imagemin([filePath], fileDirname, {
                        plugins: [
                            imageminOptipng({optimizationLevel: 2}),
                            imageminPngquant({quality: '65-85',speed: 3})
                        ]
                    }).then(files => {
                        runThen(files);
                    });
                    break;
                case "image/gif":
                    imagemin.use(imagemin.gifsicle());
                    imagemin([filePath], fileDirname, {
                        plugins: [imageminGifsicle()]
                    }).then(files => {
                        runThen(files);
                    });
                    break;
                case "image/webp":
                    imagemin([filePath], fileDirname, {
                        plugins: [
                            imageminWebp({quality: webpValue || 85})
                        ]
                    }).then(files => {
                        runThen(files);
                    });
                    break;
                case "text/css":
                    gulp.src(filePath).pipe(cleanCSS({compatibility: 'ie8'})).pipe(rename({suffix: '.min'})).pipe(gulp.dest(fileDirname)).on('end', function(){
                        runThen()
                    });
                    break;
                //case "text/javascript":
                case "application/x-js":
                    gulp.src(filePath).pipe(uglify()).pipe(rename({suffix: '.min'})).pipe(gulp.dest(fileDirname)).on('end', function(){
                        runThen()
                    });
                    break;
                case "text/html":
                    gulp.src(filePath).pipe(htmlmin({collapseWhitespace: true})).pipe(gulp.dest(fileDirname)).on('end', function(){
                        runThen()
                    });
                    break;
            }
            function runThen(files){
                if (files){
                    self.filesArray[index].optimized = files[0].data.length;
                } else {
                    self.filesArray[index].optimized = Math.floor(self.filesArray[index].size/2);
                }
                //=> [{data: <Buffer 89 50 4e …>, path: 'build/images/foo.jpg'}, …]
                index++;
                pie.set(((index / len) * 100).toFixed(0));
                if (index >= len) {
                    self._dropOver(len,files);
                    return;
                };
                filesHandle();
            }
        })();
    },
    _dropOver: function(num,files) {
        this.status = "waiting";
        this._updateState();
        this.filesArray.forEach(function(file) {
            this.diff += file.size - file.optimized;
        }.bind(this));
        this.$el.find(".ui-area-waiting").html("已处理" + num + "个文件,压缩空间" + (this.diff / (1024)).toFixed(1) + 'KB');
        localStorage.setItem("count", window.shareCount+1);
        localStorage.setItem("size", window.shareSize+1);
        ipcRenderer.send('set-share', window.shareCount+1, window.shareSize+this.diff);
    },
    _mkdirSync: function(path) {
        try {
            fs.mkdirSync(path)
        } catch (e) {
            if (e.code != 'EEXIST') throw e;
        }
    },
    _updateState: function() {
        this.$el.find(".ui-area-main").html(this.statusHtml[this.status]);
    }
}
module.exports = App;