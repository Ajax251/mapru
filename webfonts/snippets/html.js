ace.define("ace/snippets/html",["require","exports","module"], function(require, exports, module) {
"use strict";

exports.snippets = [
    {
        "content": "<!DOCTYPE html>\n<html>\n<head>\n\t<title>${1:Title}</title>\n</head>\n<body>\n\t${2}\n</body>\n</html>",
        "name": "html",
        "tabTrigger": "html"
    },
    {
        "content": "<div class=\"${1:class_name}\">\n\t${2}\n</div>",
        "name": "div",
        "tabTrigger": "div"
    },
    {
        "content": "<a href=\"${1:http://}\">${2:link}</a>",
        "name": "link",
        "tabTrigger": "a"
    },
    {
        "content": "<img src=\"${1:url}\" alt=\"${2:alt_text}\">",
        "name": "image",
        "tabTrigger": "img"
    },
    {
        "content": "<script type=\"text/javascript\">\n\t${1}\n</script>",
        "name": "script",
        "tabTrigger": "script"
    },
    {
        "content": "<style type=\"text/css\">\n\t${1}\n</style>",
        "name": "style",
        "tabTrigger": "style"
    },
    {
        "content": "<form action=\"${1:action}\" method=\"${2:get}\">\n\t${3}\n</form>",
        "name": "form",
        "tabTrigger": "form"
    },
    {
        "content": "<input type=\"${1:text}\" name=\"${2:name}\" value=\"${3:value}\">",
        "name": "input",
        "tabTrigger": "input"
    },
    {
        "content": "<button type=\"${1:button}\">${2:button_text}</button>",
        "name": "button",
        "tabTrigger": "button"
    }
];
exports.scope = "html";

});

(function() {
    ace.require(["ace/snippets/html"], function(m) {
        if (typeof module == "object" && typeof exports == "object" && module) {
            module.exports = m;
        }
    });
})();