#!/bin/bash
cd $HOME/GitHub/visbo-server-ui
export VERSION_UI=`git show -s --pretty=format:"V %ci" | head -1`
cd $HOME/GitHub/visbo-server-rest
export VERSION_REST=`git show -s --pretty=format:"V %ci" | head -1`
npm start
