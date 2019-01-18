// specify the list of operations to perform in this file
// will be called by crawler.js

// CDP documentation: https://chromedevtools.github.io/devtools-protocol/

/* NOTE: I started developing this automator as using primarily the CDP API
but since it changes so rapidly, some of the functionality has been switched to
plain JS that is sent over to the browser through the CDP.
Parts of this code might look like a hot mess.
*/

const KEYWORDS_EMAIL  = ['email', 'e-mail', 'subscribe', 'newsletter']

function fail(excptn) {
    console.error(excptn.message, excptn.stack);
    throw new Error(excptn);
}


function Automator(browser_tab) {
    console.log("-- constructor --");
    this.DOM = browser_tab.client.DOM;
    this.CSS = browser_tab.client.CSS;
    this.browser_tab = browser_tab;
}


// Add any (async) setup functionality here; call before manipulating the page
Automator.prototype.setup = async function() {
    console.log("-- setup --");
    await this.browser_tab.client.send("DOM.enable").catch(err => {throw err;});
    await this.browser_tab.client.send("CSS.enable").catch(err => {throw err;});

    // catch-all
    process.on('unhandledRejection', (reason, p) => {
        console.log('Unhandled rejection at: Promise', p, 'reason:', reason);
        console.log(reason.stack);
    });
}


// Fetches all form objects on the page
Automator.prototype.findForms = async function() {
    console.log('-- findForms --');
    var fulldoc = await this.DOM.getDocument().catch(err => { fail(err); });
    var rootNodeID = fulldoc.root.nodeId;

    var forms = await this.DOM.querySelectorAll({
        nodeId: rootNodeID,
        selector: "form"
    }).catch(err => { fail(err); });

    return new Promise(resolve => {
        resolve(forms);
    });
}


// TODO: use this wherever you fetch a style from CSS
Automator.prototype.fetchStyle = async function(nid, sname) {
    let styles = await this.CSS.getComputedStyleForNode({nodeId: nid})
        .catch(err => {throw err;});
    let thisstyle = formstyle.computedStyle.filter(el => el.name == sname);
    if (thisstyle.length > 0) {
        return thisstyle[0].value;
    }
}


Automator.prototype.isVisible = async function(nid) {
    let formstyle = await this.CSS.getComputedStyleForNode({nodeId: nid})
        .catch(err => {throw err;});
    let formdisplay = formstyle.computedStyle.filter(el => el.name == 'display');
    if (formdisplay.length > 0 && formdisplay[0].value === 'none') {
        return false;
    }

    return true;
}

// fetches value of attribute `attr` for nodeId nid
Automator.prototype.fetchAttribute = async function(nid, attr) {
    let val = null;
    let type = await this.DOM.getAttributes({nodeId: nid}).then(res => {
        // `arr` is structured like [key, value, key, value, ...]
        // we need to return the exact attribute asked for
        let arr = res.attributes;
        console.log("fetching attr:", nid, attr, arr);
        for (let i=0; i<arr.length; i++){
            if (arr[i] == attr && i+1 < arr.length) {
                val = arr[i+1];
                break;
            }
        }
    });
    return val;
}


// checks if any of keywords in `kwarr` exist
// returns a bool and a summary of matches
Automator.prototype.hasKeywords = async function(kwarr, nid) {
    var result = {
        match: false,
        // {keyword: ind, keyword: ind, ...}
        kwHits: {}
    }
    var html = await this.DOM.getOuterHTML({nodeId: nid})
        .catch(err => { throw err; });
    html = html.outerHTML.toLowerCase();

    for (let i=0; i<kwarr.length; i++){
        let ind = html.search(kwarr[i]);
        if (ind != -1) {
            result.match = true;
            result.kwHits[kwarr[i]] = ind;
        }
    }
    return result;
}


Automator.prototype.isEmailInput = async function(nid) {
    let type = await this.fetchAttribute(nid, "type").catch(err => { throw err });
    console.log("fetched type:", type);
    if (type == "email") {
        console.log('checking type=email');
        return true;
    }
    else if (type == 'text') {
        // maybe the right HTML properties aren't used but it's actually an email input
        let kwscan = await this.hasKeywords(KEYWORDS_EMAIL, nid);
        console.log('checking type=text. result:', kwscan);
        return kwscan.match;
    } else {
        return false;
    }
}


Automator.prototype.filterEmailForms = async function(forms) {
    console.log('-- filterEmailForms --');

    var emailFormCands = [];
    // var obj = null;
    var html = null;
    var visible = null;
    var forminputs = null;

    for(let k=0; k<forms.nodeIds.length; k++){
        let id = forms.nodeIds[k];
        // forms.nodeIds.forEach(async (id) => {
        // obj = await this.DOM.resolveNode({nodeId: id})
        //     .catch(err => { fail(err); });
        console.log("checking:", id);

        // don't process further if form is not visible
        visible = await this.isVisible(id).catch(err => { throw err });
        if (!visible) {
            continue;
        }
        console.log("is visible!");

        // check if form has any email-related words
        let kwscan = await this.hasKeywords(KEYWORDS_EMAIL, id);
        // html = await this.DOM.getOuterHTML({nodeId: id})
        //     .catch(err => { throw err; });
        // html = html.toLowerCase();
        // var ind = -1;
        // for (let i=0; i<KEYWORDS_EMAIL.length; i++){
        //     // if any of the words is in the form, save the form in emailFormCands
        //     ind = html.search(KEYWORDS_EMAIL[i]);
        //     if (ind != -1) {
        //         break;
        //     }
        // }
        // if no email keywords found, move on to next form
        console.log("kwscan result:", id, kwscan);
        if (!kwscan.match) {
            continue;
        }
        console.log("has keywords!", kwscan);

        // find input fields inside the form
        forminputs = await this.DOM.querySelectorAll({
            nodeId: id,
            selector: "input"
        }).catch(err => { throw err; });
        let match = false;
        console.log(forminputs);
        for (let i=0; i<forminputs.nodeIds.length; i++) {
            var iid = forminputs.nodeIds[i];
            console.log("in here buddy, with input id:", iid);
            // let temp = await this.DOM.getOuterHTML({nodeId: iid}).catch(err => {throw err});
            // console.log("look:", iid, temp);
            // let canPutEmail = await this.isVisible(iid).catch(err => {throw err});
            let canPutEmail = await this.isVisible(iid).catch(err => { throw err; });
            console.log(canPutEmail);
            canPutEmail = canPutEmail && await this.isEmailInput(iid).catch(err => { throw err; });
            console.log(iid, canPutEmail);
            if (canPutEmail) {
                console.log(iid, "is email input!");
                match = true;
                break;
            }
        }
        // if none of the inputs is taking an email, move on to the next form
        if (!match) {
            console.log("I'm quitting");
            continue;
        }

        // if made it this far...
        // add to the list of candidate forms
        emailFormCands.push({'formId': id, 'emailInputId': iid});
        // console.log("updated cands:", emailFormCands);
    }

    console.log("about to resolve promise");
    return new Promise(resolve => {
        resolve(emailFormCands);
    });
}


/* takes the candidate forms given by filterEmailForms, and returns the one
most likely to be an email form
*/
Automator.prototype.bestBetForm = async function(forms) {
    // step 1: check z-index
    console.log('-- bestBetForm -- ');
    for (let i=0; i<forms.length; i++) {
        await this.getzindex(forms[i].formId);
    }
}


Automator.prototype.getzindex = async function(nid) {
    // this is a job for the browser since we might need to traverse the DOM tree
    let nodeObj = await this.DOM.resolveNode({nodeId: nid})
        .catch(err => { fail(err); });
    let selector = "'" + nodeObj.object.description + "'";
    let jscode = "var elem = document.querySelector( " + selector + "); \
    if (elem) { \
        while(elem.parentNode != null) { \
            var zind = document.defaultView.getComputedStyle(elem)['zIndex']; \
            if (Number.isInteger(zind)) { \
                JSON.stringify(zind); \
                break; \
            } else { \
                elem = elem.parentNode; \
            } \
        } \
        JSON.stringify(0); \
    }"
    console.log("sending to browser:\n", jscode);
    let zind = await this.browser_tab.evaluateScript(jscode);
    console.log("z-index received from browser:", zind);
    return zind;

    // ========== old code ===========
    /* let styles = await this.CSS.getComputedStyleForNode({nodeId: nid})
        .catch(err => {throw err;});
    let this_zind = styles.computedStyle.filter(el => el.name == 'z-index');
    if (this_zind.length > 0 && Number.isInteger(this_zind[0].value)) {
        return this_zind[0].value;
    } else {
        // FIXME
        // can't deal with thism, handing over to browser
        let frontendNode = await this.DOM.resolveNode({nodeId: nid})
            .catch(err => { fail(err); });

        console.log("in else:", this_zind);
        console.log(JSON.parse(await this.browser_tab.evaluateScript('JSON.stringify(document.URL);')));
        return -1;
    }*/
}


Automator.prototype.fillEmailForm = async function(form) {
    // NOTE: can use this.DOM.setAttributeValue to fill forms
    return;
}


// main workhorse function called by crawler.js
// logic imported from CITP paper:
// https://github.com/itdelatrisu/OpenWPM/blob/906391b1903146496ad744d9e507d33bbbcadad8/automation/Commands/custom_commands.py
Automator.prototype.actionSequence = async function() {
    console.log("-- actionSequence --");
    await this.setup();
    var formObjects = await this.findForms();
    console.log("forms:", formObjects);
    var candidates = await this.filterEmailForms(formObjects);
    console.log("candidates:", candidates);
    var bestbet = await this.bestBetForm(candidates);
}

module.exports = Automator;
