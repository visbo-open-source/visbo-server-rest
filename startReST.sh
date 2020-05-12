#!/bin/bash
cd $HOME/GitHub/visbo-ui-build
export VERSION_UI=`git show -s --pretty=format:"%cI" | head -1`
cd $HOME/GitHub/visbo-server-rest
export VERSION_REST=`git show -s --pretty=format:"%cI" | head -1`
npm start
