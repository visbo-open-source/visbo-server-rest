#!/bin/bash
cd /home/visbo/GitHub/visbo-server-rest
export VERSION_REST=`git show -s --pretty=format:"V %ci"`
npm start
