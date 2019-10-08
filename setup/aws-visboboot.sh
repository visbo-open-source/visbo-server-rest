#!/bin/bash
echo `date` "Mount EFS Filesystem for Logs"
sudo mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport fs-89b282d0.efs.eu-central-1.amazonaws.com:/ /var/centrallog

echo `date` "Execute Update of Visbo ReST by user" `sudo -H -u ubuntu whoami`
sudo -H -u ubuntu bash /home/ubuntu/GitHub/visbo-server-rest/setup/aws-updateReST.sh
