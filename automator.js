// specify the list of operations to perform in this file
// will be called by crawler.js

// CDP documentation: https://chromedevtools.github.io/devtools-protocol/

/* NOTE: I started developing this automator as using primarily the CDP API
but since it changes so rapidly, some of the functionality has been switched to
plain JS that is sent over to the browser through the CDP.
Parts of this code might look like a hot mess.
*/

const KEYWORDS_EMAIL  = ['email', 'e-mail', 'subscribe', 'newsletter']
const KEYWORDS_MODAL = ['modal', 'dialog']
const KEYWORDS_LOGIN = ['login', 'log in', 'sign in']
const KEYWORDS_SUBMIT = ['submit', 'sign up', 'sign-up', 'signup', 'sign me up', 'subscribe', 'register', 'join']

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
    // console.log("fetched type:", type);
    if (type == "email") {
        return true;
    }
    else if (type == 'text') {
        // maybe the right HTML properties aren't used but it's actually an email input
        let kwscan = await this.hasKeywords(KEYWORDS_EMAIL, nid);
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

        // don't process further if form is not visible
        visible = await this.isVisible(id).catch(err => { throw err });
        if (!visible) {
            continue;
        }
        // console.log("is visible!");

        // check if form has any email-related words
        let kwscan = await this.hasKeywords(KEYWORDS_EMAIL, id);
        // if no email keywords found, move on to next form
        // console.log("kwscan result:", id, kwscan);
        if (!kwscan.match) {
            continue;
        }
        // console.log("has keywords!", kwscan);

        // find input fields inside the form
        forminputs = await this.DOM.querySelectorAll({
            nodeId: id,
            selector: "input"
        }).catch(err => { throw err; });
        let match = false;
        // console.log(forminputs);
        for (let i=0; i<forminputs.nodeIds.length; i++) {
            var iid = forminputs.nodeIds[i];
            // console.log("in here buddy, with input id:", iid);
            let canPutEmail = await this.isVisible(iid).catch(err => { throw err; });
            // console.log(canPutEmail);
            canPutEmail = canPutEmail && await this.isEmailInput(iid).catch(err => { throw err; });
            // console.log(iid, canPutEmail);
            if (canPutEmail) {
                // console.log(iid, "is email input!");
                match = true;
                break;
            }
        }
        // if none of the inputs is taking an email, move on to the next form
        if (!match) { continue; }

        // if made it this far...
        // add to the list of candidate forms
        emailFormCands.push({'formId': id, 'emailInputId': iid});
    }

    return new Promise(resolve => {
        resolve(emailFormCands);
    });
}


/* takes the candidate forms given by filterEmailForms, and returns the one
most likely to be an email form
*/
Automator.prototype.bestBetForm = async function(forms) {
    console.log('-- bestBetForm -- ');
    var formInfo = {};
    var rankCriteria = {};

    for (let i=0; i<forms.length; i++) {
        // save complete form info against fid (to fetch later)
        let fid = forms[i].formId;
        formInfo[fid] = forms[i];

        // step 1: check z-index
        // higher up forms are meant for user interaction
        let zind = await this.getzindex(fid);
        rankCriteria[fid] = [zind];
        console.log(rankCriteria);

        // step 2: is 'modal' or 'dialog' in the HTML?
        // pop-up forms are more likely to be asking for emails
        console.log("has modal keywords:", await this.hasKeywords(KEYWORDS_MODAL, fid));
        let kwscan = await this.hasKeywords(KEYWORDS_MODAL, fid);
        rankCriteria[fid].push(kwscan.match ? 1 : 0);

        // step 3: check if login form -- the more login terms found, the lower ranked it should be
        // not using hasKeywords functions as that doesn't give frequencies
        var formHtml = (await this.DOM.getOuterHTML({nodeId: fid})).outerHTML;
        var inputwords_c = 0;
        KEYWORDS_LOGIN.forEach(word => {
            // gi = (g)lobal (multiple matches), case (i)nsensitive
            let pattern = new RegExp(word, 'gi');
            let matches = formHtml.match(pattern);
            if(matches) {
                inputwords_c += matches.length;
            }
        });
        rankCriteria[fid].push(inputwords_c);

        // step 4: forms with more input fields should be ranked higher?
        // (undergrad kid's logic, not mine) ¯\_(ツ)_/¯
        var forminputs = await this.DOM.querySelectorAll({
            nodeId: fid,
            selector: "input"
        }).catch(err => { throw err; });
        console.log('candidate form inputs:', forminputs);
        rankCriteria[fid].push(forminputs.nodeIds.length);
    }

    // sort by entire list of properties -- can't believe i have to write such menial stuff in JS
    var sortlist = Object.keys(rankCriteria).map(function(key) {
        return [key, rankCriteria[key]];
    });
    // for compare function: return < 0 => i comes before j, return > 0, j comes before i
    sortlist  = sortlist.sort(function(i, j) {
        let a = i[1], b = j[1];
        // put form with higher z-index first
        if (a[0] != b[0]){ return b[0] - a[0];}
        // give modal forms more preference
        if (a[1] != b[1]) { return b[1] - a[1]; }
        // put one with fewer login keywords first
        if (a[2] != b[2]) { return a[2] - b[2]; }
        // rank form with more inputs higher
        if (a[3] != b[3]){ return b[3] - a[3] ; }
        // both are same, whatever
        return 0;
    });

    console.log("sorted list:", sortlist);
    console.log("picking best bet from:", formInfo);
    if (sortlist.length) {
        var bestbet = sortlist[0][0];
        return formInfo[bestbet];
    } else {
        return null;
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
    }";
    let zind = parseInt(await this.browser_tab.evaluateScript(jscode));
    // console.log("z-index received from browser:", zind);
    return zind;
}


Automator.prototype.fillEmailForm = async function(formInfo, addr) {
    console.log("-- fillEmailForm --");
    console.log(formInfo);
    var formInputs = await this.DOM.querySelectorAll({
        nodeId: formInfo.formId,
        selector: "input"
    });
    console.log("form inputs -- before:", formInputs);
    if (formInputs != null) {
        formInputs = formInputs.nodeIds;
    }
    console.log("form inputs -- after:", formInputs);

    // FIXME: there might be several things in there in addition to just email
    await this.DOM.setAttributeValue({
        nodeId: formInfo.emailInputId,
        name: "value",
        value: addr
    });
    // TODO: fill all fields of the form. pass a user info object

    // show filled form
    var html = await this.DOM.getOuterHTML({nodeId: formInfo.emailInputId})
        .catch(err => { throw err; });
    console.log("filled form:", html.outerHTML);

    // find button to click on
    var submitButton = null;
    // find the submit input type from the form inputs
    for(let i=0; i < formInputs.length; i++) {
        let iid = formInputs[i];
        let type = await this.fetchAttribute(iid, "type").catch(err => { throw err });
        console.log("form input type:", formInputs[i], type);
        if (type == 'submit' || type == 'button' || type == 'image') {
            let kwscan = await this.hasKeywords(KEYWORDS_SUBMIT, iid);
            console.log("kwscan results:", kwscan);
            if (kwscan.match) {
                submitButton = formInputs[i];
                break;
            }
        }
    }
    console.log("submit button:", submitButton);

    if (submitButton == null) {
        console.log("going to find buttons now");
        // none of the inputs is a submit button, maybe there's a button tag around here somewhere
        let formButtons = (await this.DOM.querySelectorAll({
            nodeId: formInfo.formId,
            selector: "button"
        })).nodeIds;
        console.log('formButtons:', formButtons);

        for (let j=0; j<formButtons.length; j++) {
            let visible = await this.isVisible(formButtons[j]).catch(err => { throw err });
            console.log(formButtons[j], "visibility:", visible);
            if (!visible) {
                continue;
            }

            let type = await this.fetchAttribute(formButtons[j], "type").catch(err => { throw err });
            // avoid non-submit buttons
            console.log(formButtons[j], "type:", type);
            if (type != null && (type == 'reset' || type == 'menu')) {
                continue;
            }
            let kwscan = await this.hasKeywords(KEYWORDS_SUBMIT, formButtons[j]);
            console.log(formButtons[j], "kwscan:", kwscan);
            if (kwscan.match) {
                submitButton = formButtons[j];
                break;
            }
        }
    }

    // (ask browser to) click button
    if (submitButton) {
        let nodeObj = await this.DOM.resolveNode({nodeId: submitButton})
            .catch(err => { fail(err); });
        let selector = "'" + nodeObj.object.description + "'";
        console.log("sending selector to browser:", selector);
        let jscode = "var elem = document.querySelector( " + selector + "); \
        if (elem) { \
            elem.click(); \
            JSON.stringify('done!'); \
        }";
        let msg = await this.browser_tab.evaluateScript(jscode);
        console.log("button clicked! browser said:", msg);
    }

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
    if (candidates.length > 1) {
        console.log(">> 1");
        var bestbet = await this.bestBetForm(candidates);
    } else if (candidates.lenth == 1){
        console.log(">> 2");
        var bestbet = candidates[0];
    } else {
        // TODO LATER: no candidates, search for forms in iframes
        console.log(">> 3");
        return;
    }
    console.log("best bet:", bestbet);

    // let obj = (await this.DOM.resolveNode({nodeId: bestbet.formId}));
    // console.log("BEST BET:\n", obj);

    var emailAddr = "aus_94@yahoo.com";
    await this.fillEmailForm(bestbet, emailAddr);

    // fill out the form
    // at this point in bestbet, i have the formId and the emailInputId of an email form
    // now need to head over to the object and fill it out

    // then just need to execute the submit action of the form
}

module.exports = Automator;
