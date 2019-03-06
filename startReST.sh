#!/bin/bash
cd /home/visbo/GitHub/visbo-server-ui
export VERSION_UI=`git show -s --pretty=format:"V %ci" | head -1`
cd /home/visbo/GitHub/visbo-server-rest
export VERSION_REST=`git show -s --pretty=format:"V %ci" | head -1`
npm start
