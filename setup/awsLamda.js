var https = require('https');
var util = require('util');

exports.handler = function(event, context) {
    console.log('event:'+JSON.stringify(event, null, 2));
    console.log('From SNS:', event.Records[0].Sns.Message, "len", event.Records[0].Sns.Message.length);

    var postData = {
        "channel": "#aws_dev",
        "username": "AWS SNS via Lamda :: DevQa Cloud",
        "text": "*" + event.Records[0].Sns.Subject + "*",
        "icon_emoji": ":aws:"
    };

    var message = event.Records[0].Sns.Message;
    var severity = "good";

    var jsonObj = JSON.parse(message);
    /*var x;
    for (x in jsonObj) {
      console.log("Message Comp", x, ' Value: ', jsonObj[x]);
    }*/
    console.log('NewStateValue: ', jsonObj.NewStateValue);
    if (jsonObj.NewStateValue == "ALARM") {
        console.log('NewStateValue: severity danger');
        severity = "danger";
    } else if (jsonObj.NewStateValue == "OK") {
        console.log('NewStateValue: severity good');
        severity = "good";
    } else {
        console.log('NewStateValue: severity check detail');
        var dangerMessages = [
            "has entered the ALARM state",
            " but with errors",
            " to RED",
            "During an aborted deployment",
            "Failed to deploy application",
            "Failed to deploy configuration",
            "has a dependent object",
            "is not authorized to perform",
            "Pending to Degraded",
            "Stack deletion failed",
            "Unsuccessful command execution",
            "You do not have permission",
            "Your quota allows for 0 more running instance"];

        var warningMessages = [
            " aborted operation.",
            " to YELLOW",
            "Adding instance ",
            "Degraded to Info",
            "Deleting SNS topic",
            "is currently running under desired capacity",
            "Ok to Info",
            "Ok to Warning",
            "Pending Initialization",
            "Removed instance ",
            "Rollback of environment"
            ];

        for(var dangerMessagesItem in dangerMessages) {
            if (message.indexOf(dangerMessages[dangerMessagesItem]) != -1) {
                severity = "danger";
                break;
            }
        }
    }
    console.log('Message Severity: ', severity);

    // Only check for warning messages if necessary
    if (severity == "good") {
        for(var warningMessagesItem in warningMessages) {
            if (message.indexOf(warningMessages[warningMessagesItem]) != -1) {
                severity = "warning";
                break;
            }
        }
    }

    jsonObj.Trigger = undefined;
    jsonObj.AWSAccountId = undefined;
    var text = '';
    for (var comp in jsonObj) {
        if (jsonObj[comp] && jsonObj[comp].length > 0) {
            text = text.concat(comp, ":\t", jsonObj[comp], "\n");
        }
    }
    console.log("text: ", text);
    postData.attachments = [
        {
            "color": severity,
            "text": text
        }
    ];

    var options = {
        method: 'POST',
        hostname: 'hooks.slack.com',
        port: 443,
        path: '/services/T753BM10B/BLBNDTCN4/ZUpVYbYDyM0vQHIXUHUwgwoZ'
    };

    var req = https.request(options, function(res) {
      res.setEncoding('utf8');
      res.on('data', function (chunk) {
        context.done(null);
      });
    });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });

    req.write(util.format("%j", postData));
    req.end();
};
