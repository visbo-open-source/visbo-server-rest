# node-rest-server
Secure REST API server example with Nodejs, Express, mongoose & JsonWebToken
<h2>Installing on local machine</h2>
<h4>Please make sure you have node.js installed on your machine</h4>
If you don't have, <a href="https://nodejs.org/" >click here...</a>
<br><br>
<b>1. check if you have it installed or not</b>,

	npm -v

and,

	node -v

you should see some version info in return.<br><br>


<b>2. now go to the directory where you want to place the project files using git bash (terminal for mac)</b><br>
run the command

	git clone URL

here URL is the http url you get from the repository page.<br><br>

<b>3. now navigate to the project directory with cmd (terminal for mac)</b><br>
run the command

	npm install

wait for it to be completed. It usually takes a minute or less to complete.<br>
It will download all the dependencies.<br><br>

<b>4. Configure the environment .env</b>

	Configure .env file for mongo access and log file folder.
	For the .env Content, check the env-empty file to see how it should look like and adopt the content to your mongo server with username&password and also for the log folder. For localdev we use the folder logging inside the ReST Server, needs to be created but gets not transfered to git.

<b>5. Install redis server</b>

The ReST Server needs the redis server for caching specific entries like log settings or systemVC id. Install it and start it before ReST Server is started.

Example using Docker
https://www.docker.com/ :

	npm run docker:network
	npm run docker:redis
	npm run docker:rest-up


<b>6. Now run the command</b>

	npm start
or,

	node ./bin/www

It will serve the project on default port (3484). <br><br>



<h2>API Documentation</h2>

Find the API documentation <a href="https://localdev:3484/apidoc/">here</a>.<br>
for addition information <a href="http://apidocjs.com/">follow this link</a>.
<br>
To create your own API documentation run command in the root folder<br>

	apidoc -i routes -o public/apidoc

<br>for addition information <a href="http://apidocjs.com/">follow this link</a>.
<br><br>


<h2>Module Upgrades</h2>

From time to time it might be necessary to upgrade modules like express, mongoose or many others.
The GIT Repository contains a list of modules with version numbers that are required.
Typically the developer updates this file with additional modules or newer versions of existing modules.
But the modules itself are not contained in GIT
The Node package manager (npm) offers some commands to manage the modules:<br>

	npm install // to install all required modules based on the configuration
	npm update // to update all required modules to the correct required version based on the configuration
	npm outdated // delivers a list of modules that are outdated, means newer versions of these modules are available in GIT and migth be considered for update


<h2>Developer Hint</h2>

<b>Install nodemon</b>(run on any directory, recommended for development)

	npm install -g nodemon

in case of mac, you might need to mention "sudo"<br><br>
<b>Now navigate to the project directory with cmd (terminal for mac)</b><br>
run the command

	nodemon ./bin/www

It will serve the project and restart on any file change<br>
It's good to remember that, <b>./bin/www</b> is the entry point to the app.<br><br>


<b>Please change your editor configuration like below before you start development</b>

<b>Indent character</b>: "\t" (tab)

<b>Indent size</b>: 2

<b>Line endings</b>: LF (unix)
