/**
 * Justified Gallery - v3.6
 * http://miromannino.github.io/Justified-Gallery/
 *
 * Copyright (c) 2014 Miro Mannino
 * Licensed under the MIT license.
 */
(function($) {

  /**
   * Justified Gallery controller constructor
   *
   * @param $gallery the gallery to build
   * @param settings the settings (the defaults are in $.fn.justifiedGallery.defaults)
   * @constructor
   */
  var JustifiedGallery = function ($gallery, settings) {
    this.settings = settings;
    this.imgAnalyzerTimeout = null;
    this.entries = null;
    this.buildingRow = {
      entriesBuff : [],
      width : 0,
      aspectRatio : 0
    };
    this.lastAnalyzedIndex = -1;
    this.yield = {
      every : 2, /* do a flush every n flushes (must be greater than 1, 
                  * else the analyzeImages will loop */
      flushed : 0 // flushed rows without a yield
    };
    this.border = settings.border >= 0 ? settings.border : settings.margins;
    this.offY = this.border;
    this.spinner = {
      phase : 0,
      timeSlot : 150,
      $el : $('<div class="spinner"><span></span><span></span><span></span></div>'),
      intervalId : null
    };
    this.checkWidthIntervalId = null;
    this.galleryWidth = $gallery.width();
    this.$gallery = $gallery;

    // Check the assigned settings
    this.checkSettings();
  };

  /** @returns {String} the best suffix given the width and the height */
  JustifiedGallery.prototype.getSuffix = function (width, height) {
    var longestSide;
    longestSide = (width > height) ? width : height;
    if (longestSide <= 100) {
      return this.settings.sizeRangeSuffixes.lt100;
    } else if (longestSide <= 240) {
      return this.settings.sizeRangeSuffixes.lt240;
    } else if (longestSide <= 320) {
      return this.settings.sizeRangeSuffixes.lt320;
    } else if (longestSide <= 500) {
      return this.settings.sizeRangeSuffixes.lt500;
    } else if (longestSide <= 640) {
      return this.settings.sizeRangeSuffixes.lt640;
    } else {
      return this.settings.sizeRangeSuffixes.lt1024;
    }
  };

  /**
   * Remove the suffix from the string
   *
   * @returns {string} a new string without the suffix
   */
  JustifiedGallery.prototype.removeSuffix = function (str, suffix) {
    return str.substring(0, str.length - suffix.length);
  };

  /**
   * @returns {boolean} a boolean to say if the suffix is contained in the str or not
   */
  JustifiedGallery.prototype.endsWith = function (str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  };

  /**
   * Get the used suffix of a particular url
   *
   * @param str
   * @returns {String} return the used suffix
   */
  JustifiedGallery.prototype.getUsedSuffix = function (str) {
    var voidSuffix = false;
    for (var si in this.settings.sizeRangeSuffixes) {
      if (this.settings.sizeRangeSuffixes[si].length === 0) {
        voidSuffix = true;
        continue;
      }
      if (this.endsWith(str, this.settings.sizeRangeSuffixes[si])) {
        return this.settings.sizeRangeSuffixes[si];
      }
    }

    if (voidSuffix) return "";
    else throw 'unknown suffix for ' + str;
  };

  /**
   * Given an image src, with the width and the height, returns the new image src with the
   * best suffix to show the best quality thumbnail.
   *
   * @returns {String} the suffix to use
   */
  JustifiedGallery.prototype.newSrc = function (imageSrc, imgWidth, imgHeight) {
    var matchRes = imageSrc.match(this.settings.extension);
    var ext = (matchRes != null) ? matchRes[0] : '';
    var newImageSrc = imageSrc.replace(this.settings.extension, '');
    newImageSrc = this.removeSuffix(newImageSrc, this.getUsedSuffix(newImageSrc));
    newImageSrc += this.getSuffix(imgWidth, imgHeight) + ext;
    return newImageSrc;
  };

  /**
   * Shows the images that is in the given entry
   *
   * @param $entry the entry
   * @param callback the callback that is called when the show animation is finished
   */
  JustifiedGallery.prototype.showImg = function ($entry, callback) {
    if (this.settings.cssAnimation) {
      $entry.addClass('entry-visible');
      callback();
    } else {
      $entry.stop().fadeTo(this.settings.imagesAnimationDuration, 1.0, callback);
    }
  };

  /**
   * Extract the image src form the image, looking from the 'safe-src', and if it can't be found, from the
   * 'src' attribute. It saves in the image data the 'jg.originalSrc' field, with the extracted src.
   *
   * @param $image the image to analyze
   * @returns {String} the extracted src
   */
  JustifiedGallery.prototype.extractImgSrcFromImage = function ($image) {
    var imageSrc = (typeof $image.data('safe-src') !== 'undefined') ? $image.data('safe-src') : $image.attr('src');
    $image.data('jg.originalSrc', imageSrc);
    return imageSrc;
  };

  /** @returns {jQuery} the image in the given entry */
  JustifiedGallery.prototype.imgFromEntry = function ($entry) {
    var $img = $entry.find('> img');
    if ($img.length === 0) $img = $entry.find('> a > img');
    return $img;
  };

  /** @returns {jQuery} the caption in the given entry */
  JustifiedGallery.prototype.captionFromEntry = function ($entry) {
    var $caption = $entry.find('> .caption');
    return $caption.length === 0 ? null : $caption;
  };

  /**
   * Display the entry
   *
   * @param {jQuery} $entry the entry to display
   * @param {int} x the x position where the entry must be positioned
   * @param y the y position where the entry must be positioned
   * @param imgWidth the image width
   * @param imgHeight the image height
   * @param rowHeight the row height of the row that owns the entry
   */
  JustifiedGallery.prototype.displayEntry = function ($entry, x, y, imgWidth, imgHeight, rowHeight) {
    var $image = this.imgFromEntry($entry);
    $image.css('width', imgWidth);
    $image.css('height', imgHeight);
    // if ($entry.get(0) === $image.parent().get(0)) { // TODO: to remove? this creates an error in link_around_img test
    $image.css('margin-left', - imgWidth / 2);
    $image.css('margin-top', - imgHeight / 2);
    // }
    $entry.width(imgWidth);
    $entry.height(rowHeight);
    $entry.css('top', y);
    $entry.css('left', x);

    // Image reloading for an high quality of thumbnails
    var imageSrc = $image.attr('src');
    var newImageSrc = this.newSrc(imageSrc, imgWidth, imgHeight);

    $image.one('error', function () {
      $image.attr('src', $image.data('jg.originalSrc')); //revert to the original thumbnail, we got it.
    });

    function loadNewImage() {
      if (imageSrc !== newImageSrc) { //load the new image after the fadeIn
        $image.attr('src', newImageSrc);
      }
    }

    if ($image.data('jg.loaded') === 'skipped') {
      this.onImageEvent(imageSrc, $.proxy(function() {
        this.showImg($entry, loadNewImage);
        $image.data('jg.loaded', true);
      }, this));
    } else {
      this.showImg($entry, loadNewImage);
    }

    this.displayEntryCaption($entry);
  };

  /**
   * Display the entry caption. If the caption element doesn't exists, it creates the caption using the 'alt'
   * or the 'title' attributes.
   *
   * @param {jQuery} $entry the entry to process
   */
  JustifiedGallery.prototype.displayEntryCaption = function ($entry) {
    var $image = this.imgFromEntry($entry);
    if (this.settings.captions === true) {
      var $imgCaption = this.captionFromEntry($entry);

      // Create it if it doesn't exists
      if ($imgCaption == null) {
        var caption = $image.attr('alt');
        if (typeof caption === 'undefined') caption = $entry.attr('title');
        if (typeof caption !== 'undefined') { // Create only we found something
          $imgCaption = $('<div class="caption">' + caption + '</div>');
          $entry.append($imgCaption);
          $entry.data('jg.createdCaption', true);
        }
      }

      // Create events (we check again the $imgCaption because it can be still inexistent)
      if ($imgCaption !== null) {
        if (!this.settings.cssAnimation) $imgCaption.stop().fadeTo(0, this.settings.captionSettings.nonVisibleOpacity);
        this.addCaptionEventsHandlers($entry);
      }
    } else {
      this.removeCaptionEventsHandlers($entry);
    }
  };

  /**
   * The callback for the event 'mouseenter'. It assumes that the event currentTarget is an entry.
   * It shows the caption using jQuery (or using CSS if it is configured so)
   *
   * @param {Event} eventObject the event object
   */
  JustifiedGallery.prototype.onEntryMouseEnterForCaption = function (eventObject) {
    var $caption = this.captionFromEntry($(eventObject.currentTarget));
    if (this.settings.cssAnimation) {
      $caption.addClass('caption-visible').removeClass('caption-hidden');
    } else {
      $caption.stop().fadeTo(this.settings.captionSettings.animationDuration,
          this.settings.captionSettings.visibleOpacity);
    }
  };

  /**
   * The callback for the event 'mouseleave'. It assumes that the event currentTarget is an entry.
   * It hides the caption using jQuery (or using CSS if it is configured so)
   *
   * @param {Event} eventObject the event object
   */
  JustifiedGallery.prototype.onEntryMouseLeaveForCaption = function (eventObject) {
    var $caption = this.captionFromEntry($(eventObject.currentTarget));
    if (this.settings.cssAnimation) {
      $caption.removeClass('caption-visible').removeClass('caption-hidden');
    } else {
      $caption.stop().fadeTo(this.settings.captionSettings.animationDuration,
          this.settings.captionSettings.nonVisibleOpacity);
    }
  };

  /**
   * Add the handlers of the entry for the caption
   *
   * @param $entry the entry to modify
   */
  JustifiedGallery.prototype.addCaptionEventsHandlers = function ($entry) {
    var captionMouseEvents = $entry.data('jg.captionMouseEvents');
    if (typeof captionMouseEvents === 'undefined') {
      captionMouseEvents = {
        mouseenter: $.proxy(this.onEntryMouseEnterForCaption, this),
        mouseleave: $.proxy(this.onEntryMouseLeaveForCaption, this)
      };
      $entry.on('mouseenter', undefined, undefined, captionMouseEvents.mouseenter);
      $entry.on('mouseleave', undefined, undefined, captionMouseEvents.mouseleave);
      $entry.data('jg.captionMouseEvents', captionMouseEvents);
    }
  };

  /**
   * Remove the handlers of the entry for the caption
   *
   * @param $entry the entry to modify
   */
  JustifiedGallery.prototype.removeCaptionEventsHandlers = function ($entry) {
    var captionMouseEvents = $entry.data('jg.captionMouseEvents');
    if (typeof captionMouseEvents !== 'undefined') {
      $entry.off('mouseenter', undefined, captionMouseEvents.mouseenter);
      $entry.off('mouseleave', undefined, captionMouseEvents.mouseleave);
      $entry.removeData('jg.captionMouseEvents');
    }
  };

  /**
   * Justify the building row, preparing it to
   *
   * @param isLastRow
   * @returns {*}
   */
  JustifiedGallery.prototype.prepareBuildingRow = function (isLastRow) {
    var i, $entry, $image, imgAspectRatio, newImgW, newImgH, justify = true;
    var minHeight = 0;
    var availableWidth = this.galleryWidth - 2 * this.border - (
        (this.buildingRow.entriesBuff.length - 1) * this.settings.margins);
    var rowHeight = availableWidth / this.buildingRow.aspectRatio;
    var justifiable = this.buildingRow.width / availableWidth > this.settings.justifyThreshold;

    //Skip the last row if we can't justify it and the lastRow == 'hide'
    if (isLastRow && this.settings.lastRow === 'hide' && !justifiable) {
      for (i = 0; i < this.buildingRow.entriesBuff.length; i++) {
        $entry = this.buildingRow.entriesBuff[i];
        if (this.settings.cssAnimation)
          $entry.removeClass('entry-visible');
        else
          $entry.stop().fadeTo(0, 0);
      }
      return -1;
    }

    // With lastRow = nojustify, justify if is justificable (the images will not become too big)
    if (isLastRow && !justifiable && this.settings.lastRow === 'nojustify') justify = false;

    for (i = 0; i < this.buildingRow.entriesBuff.length; i++) {
      $image = this.imgFromEntry(this.buildingRow.entriesBuff[i]);
      imgAspectRatio = $image.data('jg.imgw') / $image.data('jg.imgh');

      if (justify) {
        newImgW = (i === this.buildingRow.entriesBuff.length - 1) ? availableWidth : rowHeight * imgAspectRatio;
        newImgH = rowHeight;

        /* With fixedHeight the newImgH must be greater than rowHeight.
         In some cases here this is not satisfied (due to the justification).
         But we comment it, because is better to have a shorter but justified row instead
         to have a cropped image at the end. */
        /*if (this.settings.fixedHeight && newImgH < this.settings.rowHeight) {
         newImgW = this.settings.rowHeight * imgAspectRatio;
         newImgH = this.settings.rowHeight;
         }*/

      } else {
        newImgW = this.settings.rowHeight * imgAspectRatio;
        newImgH = this.settings.rowHeight;
      }

      availableWidth -= Math.round(newImgW);
      $image.data('jg.jimgw', Math.round(newImgW));
      $image.data('jg.jimgh', Math.ceil(newImgH));
      if (i === 0 || minHeight > newImgH) minHeight = newImgH;
    }

    if (this.settings.fixedHeight && minHeight > this.settings.rowHeight)
      minHeight = this.settings.rowHeight;

    return {minHeight: minHeight, justify: justify};
  };

  /**
   * Clear the building row data to be used for a new row
   */
  JustifiedGallery.prototype.clearBuildingRow = function () {
    this.buildingRow.entriesBuff = [];
    this.buildingRow.aspectRatio = 0;
    this.buildingRow.width = 0;
  };

  /**
   * Flush a row: justify it, modify the gallery height accordingly to the row height
   *
   * @param isLastRow
   */
  JustifiedGallery.prototype.flushRow = function (isLastRow) {
    var settings = this.settings;
    var $entry, $image, minHeight, buildingRowRes, offX = this.border;

    buildingRowRes = this.prepareBuildingRow(isLastRow);
    minHeight = buildingRowRes.minHeight;
    if (isLastRow && settings.lastRow === 'hide' && minHeight === -1) {
      this.clearBuildingRow();
      return;
    }

    if (settings.maxRowHeight > 0 && settings.maxRowHeight < minHeight) {
      minHeight = settings.maxRowHeight;
    } else if (settings.maxRowHeight === 0 && (1.5 * settings.rowHeight) < minHeight) {
      minHeight = 1.5 * settings.rowHeight;
    }

    for (var i = 0; i < this.buildingRow.entriesBuff.length; i++) {
      $entry = this.buildingRow.entriesBuff[i];
      $image = this.imgFromEntry($entry);
      this.displayEntry($entry, offX, this.offY, $image.data('jg.jimgw'), $image.data('jg.jimgh'), minHeight);
      offX += $image.data('jg.jimgw') + settings.margins;
    }

    //Gallery Height
    this.$gallery.height(this.offY + minHeight + this.border + (this.isSpinnerActive() ? this.getSpinnerHeight() : 0));

    if (!isLastRow || (minHeight <= this.settings.rowHeight && buildingRowRes.justify)) {
      //Ready for a new row
      this.offY += minHeight + this.settings.margins;
      this.clearBuildingRow();
      this.$gallery.trigger('jg.rowflush');
    }
  };

  /**
   * Checks the width of the gallery container, to know if a new justification is needed
   */
  JustifiedGallery.prototype.checkWidth = function () {
    this.checkWidthIntervalId = setInterval($.proxy(function () {
      var galleryWidth = parseInt(this.$gallery.width(), 10);
      if (this.galleryWidth !== galleryWidth) {
        this.galleryWidth = galleryWidth;
        this.rewind();

        // Restart to analyze
        this.startImgAnalyzer(true);
      }
    }, this), this.settings.refreshTime);
  };

  /**
   * @returns {boolean} a boolean saying if the spinner is active or not
   */
  JustifiedGallery.prototype.isSpinnerActive = function () {
    return this.spinner.intervalId != null;
  };

  /**
   * @returns {int} the spinner height
   */
  JustifiedGallery.prototype.getSpinnerHeight = function () {
    return this.spinner.$el.innerHeight();
  };

  /**
   * Stops the spinner animation and modify the gallery height to exclude the spinner
   */
  JustifiedGallery.prototype.stopLoadingSpinnerAnimation = function () {
    clearInterval(this.spinner.intervalId);
    this.spinner.intervalId = null;
    this.$gallery.height(this.$gallery.height() - this.getSpinnerHeight());
    this.spinner.$el.detach();
  };

  /**
   * Starts the spinner animation
   */
  JustifiedGallery.prototype.startLoadingSpinnerAnimation = function () {
    var spinnerContext = this.spinner;
    var $spinnerPoints = spinnerContext.$el.find('span');
    clearInterval(spinnerContext.intervalId);
    this.$gallery.append(spinnerContext.$el);
    this.$gallery.height(this.offY + this.getSpinnerHeight());
    spinnerContext.intervalId = setInterval(function () {
      if (spinnerContext.phase < $spinnerPoints.length) {
        $spinnerPoints.eq(spinnerContext.phase).fadeTo(spinnerContext.timeSlot, 1);
      } else {
        $spinnerPoints.eq(spinnerContext.phase - $spinnerPoints.length).fadeTo(spinnerContext.timeSlot, 0);
      }
      spinnerContext.phase = (spinnerContext.phase + 1) % ($spinnerPoints.length * 2);
    }, spinnerContext.timeSlot);
  };

  /**
   * Rewind the image analysis to start from the first entry.
   */
  JustifiedGallery.prototype.rewind = function () {
    this.lastAnalyzedIndex = -1;
    this.offY = this.border;
    this.clearBuildingRow();
  };

  /**
   * Hide the image of the buildingRow to prevent strange effects when the row will be
   * re-justified again
   */
  JustifiedGallery.prototype.hideBuildingRowImages = function () {
    for (var i = 0; i < this.buildingRow.entriesBuff.length; i++) {
      if (this.settings.cssAnimation) {
        this.buildingRow.entriesBuff[i].removeClass('entry-visible');
      } else {
        this.buildingRow.entriesBuff[i].stop().fadeTo(0, 0);
      }
    }
  };

  /**
   * Update the entries searching it from the justified gallery HTML element
   *
   * @param norewind if norewind only the new entries will be changed (i.e. randomized, sorted or filtered)
   * @returns {boolean} true if some entries has been founded
   */
  JustifiedGallery.prototype.updateEntries = function (norewind) {
    this.entries = this.$gallery.find('> a, > div:not(.spinner)').toArray();
    if (this.entries.length === 0) return false;

    if (this.settings.randomize) this.modifyEntries(this.shuffleArray, norewind);

    return true;
  };

  /**
   * Apply the entries order to the DOM, iterating the entries and appending the images
   *
   * @param entries the entries that has been modified and that must be re-ordered in the DOM
   */
  JustifiedGallery.prototype.insertToGallery = function (entries) {
    var that = this;
    $.each(entries, function () {
      $(this).appendTo(that.$gallery);
    });
  };

  /**
   * Shuffle the array using the Fisher-Yates shuffle algorithm
   *
   * @param a the array to shuffle
   * @return the shuffled array
   */
  JustifiedGallery.prototype.shuffleArray = function (a) {
    var i, j, temp;
    for (i = a.length - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      temp = a[i];
      a[i] = a[j];
      a[j] = temp;
    }
    return a;
  };

  /**
   * Modify the entries. With norewind only the new inserted images will be modified (the ones after lastAnalyzedIndex)
   *
   * @param functionToApply the function to call to modify the entries (e.g. sorting, randomization, filtering)
   * @param norewind specify if the norewind has been called or not
   */
  JustifiedGallery.prototype.modifyEntries = function (functionToApply, norewind) {
    var lastEntries = norewind ?
        this.entries.splice(this.lastAnalyzedIndex + 1, this.entries.length - this.lastAnalyzedIndex - 1)
        : this.entries;
    lastEntries = functionToApply.call(this, lastEntries);
    this.insertToGallery(lastEntries);
    this.entries = norewind ? this.entries.concat(lastEntries) : lastEntries;
  };

  /**
   * Destroy the Justified Gallery instance.
   *
   * It clears all the css properties added in the style attributes. We doesn't backup the original
   * values for those css attributes, because it costs (performance) and because in general one
   * shouldn't use the style attribute for an uniform set of images (where we suppose the use of
   * classes). Creating a backup is also difficult because JG could be called multiple times and
   * with different style attributes.
   */
  JustifiedGallery.prototype.destroyJustifiedGalleryInstance = function () {
    clearInterval(this.checkWidthIntervalId);

    $.each(this.entries, $.proxy(function(_, entry) {
      var $entry = $(entry);

      // Reset entry style
      $entry.css('width', '');
      $entry.css('height', '');
      $entry.css('top', '');
      $entry.css('left', '');
      $entry.data('jg.loaded', undefined);
      $entry.removeClass('jg-entry');

      // Reset image style
      var $img = this.imgFromEntry($entry);
      $img.css('width', '');
      $img.css('height', '');
      $img.css('margin-left', '');
      $img.css('margin-top', '');
      $img.attr('src', $img.data('jg.originalSrc'));
      $img.data('jg.originalSrc', undefined);

      // Remove caption
      this.removeCaptionEventsHandlers($entry);
      var $caption = this.captionFromEntry($entry);
      if ($entry.data('jg.createdCaption')) {
        // remove also the caption element (if created by jg)
        $entry.data('jg.createdCaption', undefined);
        if ($caption != null) $caption.remove();
      } else {
        if ($caption != null) $caption.fadeTo(0, 1);
      }

    }, this));

    this.$gallery.css('height', '');
    this.$gallery.removeClass('justified-gallery');
    this.$gallery.data('jg.controller', undefined);
  };

  /**
   * Analyze the images and builds the rows. It returns if it found an image that is not loaded.
   *
   * @param isForResize if the image analyzer is called for resizing or not, to call a different callback at the end
   */
  JustifiedGallery.prototype.analyzeImages = function (isForResize) {
    var isLastRow;

    for (var i = this.lastAnalyzedIndex + 1; i < this.entries.length; i++) {
      var $entry = $(this.entries[i]);
      var $image = this.imgFromEntry($entry);

      if ($image.data('jg.loaded') === true || $image.data('jg.loaded') === 'skipped') {
        isLastRow = i >= this.entries.length - 1;

        var availableWidth = this.galleryWidth - 2 * this.border - (
            (this.buildingRow.entriesBuff.length - 1) * this.settings.margins);
        var imgAspectRatio = $image.data('jg.imgw') / $image.data('jg.imgh');
        if (availableWidth / (this.buildingRow.aspectRatio + imgAspectRatio) < this.settings.rowHeight) {
          this.flushRow(isLastRow);
          if(++this.yield.flushed >= this.yield.every) {
            this.startImgAnalyzer(isForResize);
            return;
          }
        }

        this.buildingRow.entriesBuff.push($entry);
        this.buildingRow.aspectRatio += imgAspectRatio;
        this.buildingRow.width += imgAspectRatio * this.settings.rowHeight;
        this.lastAnalyzedIndex = i;

      } else if ($image.data('jg.loaded') !== 'error') {
        return;
      }
    }

    // Last row flush (the row is not full)
    if (this.buildingRow.entriesBuff.length > 0) this.flushRow(true);

    if (this.isSpinnerActive()) {
      this.stopLoadingSpinnerAnimation();
    }

    /* Stop, if there is, the timeout to start the analyzeImages.
     This is because an image can be set loaded, and the timeout can be set,
     but this image can be analyzed yet.
     */
    this.stopImgAnalyzerStarter();

    //On complete callback
    this.$gallery.trigger(isForResize ? 'jg.resize' : 'jg.complete');
  };

  /**
   * Stops any ImgAnalyzer starter (that has an assigned timeout)
   */
  JustifiedGallery.prototype.stopImgAnalyzerStarter = function () {
    this.yield.flushed = 0;
    if (this.imgAnalyzerTimeout !== null) clearTimeout(this.imgAnalyzerTimeout);
  };

  /**
   * Starts the image analyzer. It is not immediately called to let the browser to update the view
   *
   * @param isForResize specifies if the image analyzer must be called for resizing or not
   */
  JustifiedGallery.prototype.startImgAnalyzer = function (isForResize) {
    var that = this;
    this.stopImgAnalyzerStarter();
    this.imgAnalyzerTimeout = setTimeout(function () {
      that.analyzeImages(isForResize);
    }, 0.001); // we can't start it immediately due to a IE different behaviour
  };

  /**
   * Checks if the image is loaded or not using another image object. We cannot use the 'complete' image property,
   * because some browsers, with a 404 set complete = true.
   *
   * @param imageSrc the image src to load
   * @param onLoad callback that is called when the image has been loaded
   * @param onError callback that is called in case of an error
   */
  JustifiedGallery.prototype.onImageEvent = function (imageSrc, onLoad, onError) {
    if (!onLoad && !onError) {
      return;
    }

    var memImage = new Image();
    var $memImage = $(memImage);
    if (onLoad) {
      $memImage.one('load', function () {
        $memImage.off('load error');
        onLoad(memImage);
      });
    }
    if (onError) {
      $memImage.one('error', function() {
        $memImage.off('load error');
        onError(memImage);
      });
    }
    memImage.src = imageSrc;
  };

  /**
   * Init of Justified Gallery controlled
   * It analyzes all the entries starting theirs loading and calling the image analyzer (that works with loaded images)
   */
  JustifiedGallery.prototype.init = function () {
    var imagesToLoad = false, skippedImages = false, that = this;
    $.each(this.entries, function (index, entry) {
      var $entry = $(entry);
      var $image = that.imgFromEntry($entry);

      $entry.addClass('jg-entry');

      if ($image.data('jg.loaded') !== true && $image.data('jg.loaded') !== 'skipped') {

        // Link Rel global overwrite
        if (that.settings.rel !== null) $entry.attr('rel', that.settings.rel);

        // Link Target global overwrite
        if (that.settings.target !== null) $entry.attr('target', that.settings.target);

        // Image src
        var imageSrc = that.extractImgSrcFromImage($image);
        $image.attr('src', imageSrc);

        /* If we have the height and the width, we don't wait that the image is loaded, but we start directly
         * with the justification */
        if (that.settings.waitThumbnailsLoad === false) {
          var width = parseInt($image.attr('width'), 10);
          var height = parseInt($image.attr('height'), 10);
          if (!isNaN(width) && !isNaN(height)) {
            $image.data('jg.imgw', width);
            $image.data('jg.imgh', height);
            $image.data('jg.loaded', 'skipped');
            skippedImages = true;
            that.startImgAnalyzer(false);
            return true; // continue
          }
        }

        $image.data('jg.loaded', false);
        imagesToLoad = true;

        // Spinner start
        if (!that.isSpinnerActive()) {
          that.startLoadingSpinnerAnimation();
        }

        that.onImageEvent(imageSrc, function (loadImg) { // image loaded
          $image.data('jg.imgw', loadImg.width);
          $image.data('jg.imgh', loadImg.height);
          $image.data('jg.loaded', true);
          that.startImgAnalyzer(false);
        }, function () { // image load error
          $image.data('jg.loaded', 'error');
          that.startImgAnalyzer(false);
        });

      }

    });

    if (!imagesToLoad && !skippedImages) this.startImgAnalyzer(false);
    this.checkWidth();
  };

  /**
   * Check the range suffixes
   *
   * @param range the range key
   */
  JustifiedGallery.prototype.checkRangeSuffix = function (range) {
    if (typeof this.settings.sizeRangeSuffixes[range] !== 'string') {
      throw 'sizeRangeSuffixes.' + range + ' must be a string';
    }
  };

  /**
   * Checks that it is a valid number. If a string is passed it is converted to a number
   *
   * @param settingContainer the object that contains the setting (to allow the conversion)
   * @param settingName the setting name
   */
  JustifiedGallery.prototype.checkOrConvertNumber = function (settingContainer, settingName) {
    if (typeof settingContainer[settingName] === 'string') {
      settingContainer[settingName] = parseFloat(settingContainer[settingName], 10);
    }

    if (typeof settingContainer[settingName] === 'number') {
      if (isNaN(settingContainer[settingName])) throw 'invalid number for ' + settingName;
    } else {
      throw settingName + ' must be a number';
    }
  };

  /**
   * Checks the settings
   */
  JustifiedGallery.prototype.checkSettings = function () {

      if (typeof this.settings.sizeRangeSuffixes !== 'object')
        throw 'sizeRangeSuffixes must be defined and must be an object';

      this.checkRangeSuffix('lt100');
      this.checkRangeSuffix('lt240');
      this.checkRangeSuffix('lt320');
      this.checkRangeSuffix('lt500');
      this.checkRangeSuffix('lt640');
      this.checkRangeSuffix('lt1024');

      this.checkOrConvertNumber(this.settings, 'rowHeight');
      this.checkOrConvertNumber(this.settings, 'maxRowHeight');

      if (this.settings.maxRowHeight > 0 &&
          this.settings.maxRowHeight < this.settings.rowHeight) {
        this.settings.maxRowHeight = this.settings.rowHeight;
      }

      this.checkOrConvertNumber(this.settings, 'margins');
      this.checkOrConvertNumber(this.settings, 'border');

      if (this.settings.lastRow !== 'nojustify' &&
          this.settings.lastRow !== 'justify' &&
          this.settings.lastRow !== 'hide') {
        throw 'lastRow must be "nojustify", "justify" or "hide"';
      }

      this.checkOrConvertNumber(this.settings, 'justifyThreshold');
      if (this.settings.justifyThreshold < 0 || this.settings.justifyThreshold > 1)
        throw 'justifyThreshold must be in the interval [0,1]';
      if (typeof this.settings.cssAnimation !== 'boolean') {
        throw 'cssAnimation must be a boolean';
      }

      this.checkOrConvertNumber(this.settings.captionSettings, 'animationDuration');
      this.checkOrConvertNumber(this.settings, 'imagesAnimationDuration');

      this.checkOrConvertNumber(this.settings.captionSettings, 'visibleOpacity');
      if (this.settings.captionSettings.visibleOpacity < 0 || this.settings.captionSettings.visibleOpacity > 1)
        throw 'captionSettings.visibleOpacity must be in the interval [0, 1]';

      this.checkOrConvertNumber(this.settings.captionSettings, 'nonVisibleOpacity');
      if (this.settings.captionSettings.visibleOpacity < 0 || this.settings.captionSettings.visibleOpacity > 1)
        throw 'captionSettings.nonVisibleOpacity must be in the interval [0, 1]';

      if (typeof this.settings.fixedHeight !== 'boolean') {
        throw 'fixedHeight must be a boolean';
      }

      if (typeof this.settings.captions !== 'boolean') {
        throw 'captions must be a boolean';
      }

      this.checkOrConvertNumber(this.settings, 'refreshTime');

      if (typeof this.settings.randomize !== 'boolean') {
        throw 'randomize must be a boolean';
      }
  };

  /**
   * Update the existing settings only changing some of them
   *
   * @param newSettings the new settings (or a subgroup of them)
   */
  JustifiedGallery.prototype.updateSettings = function (newSettings) {
    // In this case Justified Gallery has been called again changing only some options
    this.settings = $.extend({}, this.settings, newSettings);

    // As reported in the settings: negative value = same as margins, 0 = disabled
    this.border = this.settings.border >= 0 ? this.settings.border : this.settings.margins;

    // Checks the new settings
    this.checkSettings();
  };

  /**
   * Justified Gallery plugin for jQuery
   *
   * Events
   *  - jg.complete : called when all the gallery has been created
   *  - jg.resize : called when the gallery has been resized
   *  - jg.rowflush : when a new row appears
   *
   * @param arg the action (or the settings) passed when the plugin is called
   * @returns {*} the object itself
   */
  $.fn.justifiedGallery = function (arg) {
    return this.each(function (index, gallery) {

      var $gallery = $(gallery);
      $gallery.addClass('justified-gallery');

      var controller = $gallery.data('jg.controller');
      if (typeof controller === 'undefined') {

        // Create controller and assign it to the object data
        if (typeof arg !== 'undefined' && arg !== null && typeof arg !== 'object') {
          throw 'The argument must be an object';
        }
        controller = new JustifiedGallery($gallery, $.extend({}, $.fn.justifiedGallery.defaults, arg));
        $gallery.data('jg.controller', controller);

      } else if (arg === 'norewind') {

        // In this case we don't rewind: we analyze only the latest images (e.g. to complete the last unfinished row
        controller.hideBuildingRowImages();

      } else if (arg === 'destroy') {

        // Destroy
        controller.destroyJustifiedGalleryInstance();
        return;

      } else {

        // In this case Justified Gallery has been called again changing only some options
        controller.updateSettings(arg);
        controller.rewind();
      }

      if (!controller.updateEntries(arg === 'norewind')) return;
      controller.init();

    });
  };

  // Default options
  $.fn.justifiedGallery.defaults = {
    sizeRangeSuffixes: {
      'lt100': '',  // e.g. Flickr uses '_t'
      'lt240': '',  // e.g. Flickr uses '_m'
      'lt320': '',  // e.g. Flickr uses '_n'
      'lt500': '',  // e.g. Flickr uses ''
      'lt640': '',  // e.g. Flickr uses '_z'
      'lt1024': ''  // e.g. Flickr uses '_b'
    },
    rowHeight: 120,
    maxRowHeight: 0, // negative value = no limits, 0 = 1.5 * rowHeight
    margins: 1,
    border: -1, // negative value = same as margins, 0 = disabled

    lastRow: 'nojustify', // or can be 'justify' or 'hide'
    justifyThreshold: 0.75, /* if row width / available space > 0.75 it will be always justified
                             * (i.e. lastRow setting is not considered) */
    fixedHeight: false,
    waitThumbnailsLoad: true,
    captions: true,
    cssAnimation: false,
    imagesAnimationDuration: 500, // ignored with css animations
    captionSettings: { // ignored with css animations
      animationDuration: 500,
      visibleOpacity: 0.7,
      nonVisibleOpacity: 0.0
    },
    rel: null, // rewrite the rel of each analyzed links
    target: null, // rewrite the target of all links
    extension: /\.[^.\\/]+$/,
    refreshTime: 100,
    randomize: false
  };
  
}(jQuery));
