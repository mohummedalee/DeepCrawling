// specify the list of operations to perform in this file
// will be called by crawler.js

function fail(excptn) {
    console.error(excptn.message, excptn.stack);
    throw new Error(excptn);
}

function Automator(browser_tab) {
    console.log(">>> constructor");
    this.DOM = browser_tab.client.DOM;
    this.browser_tab = browser_tab;
}

// Add any (async) setup functionality here; call before manipulating the page
Automator.prototype.setup = async function() {
    console.log('>>> setup', this.DOM);
    try {
        await this.browser_tab.client.send("DOM.enable");
    } catch (ex) { fail(ex); }
}

// Fetches all form objects on the page
Automator.prototype.findForms = async function() {
    console.log('>>> findForms', this.DOM);
    try {
        var fulldoc = await this.DOM.getDocument();
    } catch(err) { fail(err); }
    console.log(1, "\n>>>>>>>>>>>><<<<<<<<<<<<<<<<<<\n", fulldoc, typeof fulldoc);
    console.log(2, fulldoc.root);
    console.log(3, typeof fulldoc.root);
    console.log(4, fulldoc.root.nodeId);
    var rootNodeID = fulldoc.root.nodeId;
    console.log(5, typeof rootNodeID, Number.isInteger(rootNodeID),
    typeof parseInt(rootNodeID), typeof "form");

    try {
        var forms = await this.DOM.querySelectorAll({
            nodeId: rootNodeID,
            selector: "form"
        });
        console.log(6, forms);
    } catch (err) { fail(err); }

    var formObjects = [];
    forms.nodeIds.forEach(async (id) => {
        try {
            let temp = await DOM.resolveNode({nodeId: id});
            console.log(temp);
            let lookit = await DOM.getOuterHTML({nodeId: id});
            console.log(lookit);
            formObjects.push(temp);
        } catch (err) { fail(err); }
    });

    return new Promise(resolve => {
        resolve(formObjects);
    });
}

Automator.prototype.filterEmailForms = async function(objs) {
    console.log('>>> filterEmailForms', this.DOM);
    // for each (f in forms){
    //     let style = window.getComptedStyle(el);
    //     if (style.display == 'none') {
    //         continue;
    //     }
    // }
    // let newsletter_form = null;
    var emailForms = "mama";

    // search for forms in iframes if no explicit form found
    // let iframes = document.getElementsByTagName("iframe");
    // search for forms in the current HTML page
    console.log('in filterEmailForms');
    return new Promise(resolve => {
        resolve(emailForms);
    });
}

Automator.prototype.fillEmailForm = async function(form) {
    // NOTE: can use DOM.setAttributeValue to fill forms
    return;
}

// logic imported from CITP paper:
// https://github.com/itdelatrisu/OpenWPM/blob/906391b1903146496ad744d9e507d33bbbcadad8/automation/Commands/custom_commands.py
Automator.prototype.actionSequence = async function() {
    let that = this;
    // let forms = document.getElementsByTagName("form");
    console.log("inside actionSequence!");
    try {
        await that.setup();
            // .then(that.findForms)
            // .then(that.filterEmailForms);
        let formObjects = await this.findForms();
        let emailForms = await this.filterEmailForms(formObjects);
    } catch(err) { fail(err); }

    console.log("finally:", emailForms);
}

module.exports = Automator;
