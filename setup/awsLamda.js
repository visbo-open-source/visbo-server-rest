var https = require('https');
var util = require('util');

exports.handler = function(event, context) {
    console.log('event:'+JSON.stringify(event, null, 2));
    console.log('From SNS:', event.Records[0].Sns.Message, "len", event.Records[0].Sns.Message.length);

    var channel = "#aws_other";
    var username = "AWS Monitoring";
    var path = '/services/T753BM10B/BLBNDTCN4/ZUpVYbYDyM0vQHIXUHUwgwoZ';
    var subject = 'Not Set';
    var message = 'Unkown';
    var jsonObj = undefined;
    var sendMessage = true;

    if (event && event.Records && event.Records.length >= 1 && event.Records[0].Sns && event.Records[0].Sns.Subject) {
        // Handle Notifications with Area set in Subject (i.e. LoadBalancer Activity)
        subject = event.Records[0].Sns.Subject;
        console.log('Subject Available Check Area:', subject);
        if (subject.indexOf("VisboDev") >= 0) {
            channel = "#aws_dev";
        } else if (subject.indexOf("VisboStag") >= 0) {
            channel = "#aws_stag";
        } else if (subject.indexOf("VisboProd") >= 0) {
            channel = "aws_prod";
        }
        jsonObj = JSON.parse(event.Records[0].Sns.Message);
    } else if (event && event.Records && event.Records.length >= 1 && event.Records[0].Sns && event.Records[0].Sns.Message) {
        // Handle Notifications with Area set in Message (i.e. System manager Upgrade)
        subject = (JSON.stringify(event.Records[0].Sns.Message)).substr(0,40);
        console.log('Subject not Available Check Message:', subject);
        jsonObj = JSON.parse(event.Records[0].Sns.Message);
        if (jsonObj["detail-type"] && jsonObj["detail"]) {
            subject = jsonObj["detail-type"].concat(" Status: ", jsonObj.detail.status || 'Unkown');
        }
        if (event.Records[0].Sns.Message.indexOf("VisboDev") >= 0) {
            channel = "#aws_dev";
        } else if (event.Records[0].Sns.Message.indexOf("VisboStag") >= 0) {
            channel = "#aws_stag";
        } else if (event.Records[0].Sns.Message.indexOf("VisboProd") >= 0) {
            channel = "aws_prod";
        } else {
            sendMessage = false;
        }
    }

    var postData = {
        "channel": channel,
        "username": username,
        "text": "*" + subject + "*"
    };

    var severity = "good";

    // console.log('NewStateValue: ', jsonObj.NewStateValue);
    if (jsonObj.NewStateValue == "ALARM") {
        // console.log('NewStateValue: severity danger');
        severity = "danger";
    } else if (jsonObj.NewStateValue == "OK") {
        // console.log('NewStateValue: severity good');
        severity = "good";
    } else if (jsonObj.detail && jsonObj.detail.status == "Failed") {
        console.log('Command Execution Failed: severity danger');
        severity = "danger";
    } else if (jsonObj.detail && jsonObj.detail.status == "InProgress") {
        console.log('Command Execution InProgress: severity danger');
        severity = "warning";
    }
    // console.log('jsonObj: ', JSON.stringify(jsonObj));

    console.log('Message Severity: ', severity);
    if (!sendMessage && severity == "good") {
        console.log("Do not send a Notification in case of Success but without specific info i.e. Check for Updates");
        // req.end();
    }

    jsonObj.Trigger = undefined;
    jsonObj.AWSAccountId = undefined;
    var text = '';
    var startDate, endDate, status;
    var extendedMessage = true;
    if (jsonObj.time) {
        text = text.concat('Time: \t', jsonObj.time, '\n');
        endDate = new Date(jsonObj.time);
    }
    if (jsonObj.detail && jsonObj.detail.parameters) {
        var param = JSON.parse(jsonObj.detail.parameters);
        if (param.commands) {
            var cmd = JSON.stringify(param.commands);
            if (cmd.indexOf("aws-updateReST.sh") >= 0) {
                text = text.concat('Command: \tUpdate Visbo Software\n');
                extendedMessage = false
            } else {
                text = text.concat('Commands available: \t', cmd, '\n');
            }
        } else {
            text = text.concat('Params: \t', jsonObj.detail.parameters, '\n');
        }
    }
    if (jsonObj.detail && jsonObj.detail.status) {
        status = jsonObj.detail.status;
        text = text.concat('Status: \t', status, '\n');
    }
    if (jsonObj.detail && jsonObj.detail['requested-date-time']) {
        startDate = new Date(jsonObj.detail['requested-date-time']);
    }
    if (startDate && endDate && status !== 'InProgress') {
        text = text.concat('Duration: \t', Math.round((endDate.getTime() - startDate.getTime()) / 1000), ' sec.\n');
    }
    if (extendedMessage) {
        text = text.concat('\n\n\n');

        for (var comp in jsonObj) {
            var type = typeof jsonObj[comp];
            console.log('Convert Item: ', comp, ' of type ', type);
            if (type == "string" || type == "number" || type == "boolean") {
                text = text.concat(comp, ":\t", jsonObj[comp], "\n");
            } else if (type == "object") {
                text = text.concat(comp, ":\t", "\n");
                for (var subcomp in jsonObj[comp]) {
                    type = typeof subcomp;
                    if (type == "string" || type == "number" || type == "boolean") {
                        text = text.concat('\t', subcomp, ":\t", jsonObj[comp][subcomp], "\n");
                    }
                }
            }
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
        path: path
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
