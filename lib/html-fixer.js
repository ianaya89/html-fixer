var fs = require('fs');
var pjson = require('../package.json');
var program = require('commander');
var colors = require('colors');

program.version(pjson.version)
.option('-d, --directory [Directory]', 'select directory')
.parse(process.argv);

function getFilesFromDirectory(dir, callback) {
  var files = [];

  fs.readdir(dir, function(err, childs) {
    var dirs = [];
    var child;
    var stats;

    if (err) {
      return callback(err, files);
    }

    childs.forEach(function(child) {
      child = [dir, child].join('/');
      stats = fs.statSync(child);

      if (stats.isDirectory()) {
        dirs.push(child);
      }
      else if (child.substring(child.lastIndexOf('.')).indexOf('html') !== -1) {
        files.push(child);
      }
    });

    var dirsCount = dirs.length;
    if (dirsCount === 0) callback(null, files);

    dirs.forEach(function(dir) {
      getFilesFromDirectory(dir, function(err, f) {
        dirsCount--;
        files = files.concat(f);

        if (dirsCount === 0) {
          callback(null, files);
        }
      });
    });
  });
}

function removeComments(str, preserveSpace) {
  preserveSpace = preserveSpace || true;
  var reg = /<![ \r\n\t]*(?:--(?:[^\-]|[\r\n]|-[^\-])*--[ \r\n\t]*)\>/;

  return str.replace(reg, function(m) {
    return preserveSpace ? m.split('\n').map(function() {
      return '';
    }).join('\n') : '';
  });
}

function removeTag(tag, str, preserveSpace) {
  preserveSpace = preserveSpace || true;
  var reg = new RegExp('<' + tag + '[^>]*>([^<]*(?:(?!<\/' + tag + '>)<[^<]*)*)<\/' + tag + '>', 'ig');

  return str.replace(reg, function(m) {
    return preserveSpace ? m.split('\n').map(function() {
      return '';
    }).join('\n') : '';
  });
}

function clearHTML(str) {
  var tagsToRemove = ['style', 'script', 'noscript', 'svg'];

  tagsToRemove.forEach(function(tag) {
    str = removeTag(tag, str);
  });

  return removeComments(str);
}

function isClosingTagOf(tag) {
  var spl = tag.split('/');
  return spl.length === 2 && spl[1];
}

function isSelfClosingTag(tag) {
  var selfClosingTags = [
    'area',
    'base',
    'br',
    'col',
    'command',
    'comment',
    'embed',
    'hr',
    'img',
    'input',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr'
  ];
  return (selfClosingTags.indexOf(tag) > -1);
}

function findUnclosed(str) {
  var reg = /(<(\/?[a-z]*)[^>]*>)/ig;
  var tagsStack = [];
  var tags = [];
  var errors = [];

  str = clearHTML(str);

  str.split('\n').forEach(function(line, i) {
    while ((match = reg.exec(line)) !== null) {
      tags.push({name:match[2], tag:match[1], line: i + 1});
    }
  });

  tags.forEach(function(tag) {
    var tagName = tag.name;
    if (!tagName || isSelfClosingTag(tagName)) {
      return;
    }

    var closing = isClosingTagOf(tagName);
    if (closing) {
      if (tagsStack.length === 0) {
        errors.push(['Closing tag', tag.tag, 'defined on line', tag.line, 'doesn\'t have corresponding open tag'].join(' '));
        return;
      }

      var op = tagsStack.pop();
      if (closing != op.name) {
        errors.push(['Close tag', tag.tag, 'defined on line', tag.line, 'doesn\'t match open tag', op.tag, 'defined on line', op.line].join(' '));
        return;
      }
    }
    else {
      tagsStack.push(tag);
    }
  });

  tagsStack.forEach(function(tag) {
    errors.push(['Unclosed tag', tag.tag, 'defined on line', tag.line].join(' '));
  });

  return {passed:!errors.length, errors: errors};
}

function main() {

  if (!program.directory) {
    console.log('Missing directory parametter (-d or --directory)'.red);
    return;
  }

  console.log('STARTING html-fixer IN DIRECTORY: '.magenta + program.directory.cyan);

  getFilesFromDirectory(program.directory, function(err, files) {
    var errorCount = 0;
    files.forEach(function(f) {
      if (f.split('.').pop() !== 'html') {
        return;
      }

      var content = fs.readFileSync(f, 'utf-8');
      console.log('\nFile: '.magenta + f.cyan);

      var result = findUnclosed(content);

      if (result.passed) {
        console.log('\u2714 OK:'.green, f.cyan);
      }
      else {
        errorCount++;
        result.errors.forEach(function(e) {
          console.log('\u2718 ERROR:'.red, f, e);
        });
      }
    });

    if (errorCount) {
      console.log('\n \u2718 '.red, [errorCount, files.length].join('/').red + ':'.red, 'files with errors'.yellow);
    }
    else {
      console.log('\n \u2714 '.green, 'NO files with errors'.green);
    }
  });
}

module.exports.start = main;
