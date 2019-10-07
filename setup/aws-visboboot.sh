#!/bin/bash
echo "Mount EFS Filesystem for Logs"
sudo mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport fs-ac623ef5.efs.eu-central-1.amazonaws.com:/ /var/centrallog
