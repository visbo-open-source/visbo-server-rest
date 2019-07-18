
/ AWS WEB Server 6
ssh -i "$HOME/.ssh/DevVisboAWS.pem" ubuntu@ec2-18-194-45-46.eu-central-1.compute.amazonaws.com
ssh -i "$HOME/.ssh/DevVisboAWS.pem" ubuntu@ec2-3-120-227-138.eu-central-1.compute.amazonaws.com
cd $HOME/Downloads
alias VP="newman run -e VisboReSTAWSDevelopment.postman_environment.json 40Parallelism.postman_collection.json"

#
  sudo cp $HOME/GitHub/visbo-server-rest/install/nginx.aws.dev.visbo.net /etc/nginx/sites-available/dev.visbo.net
  # sudo ln -s /etc/nginx/sites-available/dev.visbo.net /etc/nginx/sites-enabled/dev.visbo.net
  sudo systemctl reload nginx

# UI Setup
  # EDIT THE CONFIG File for UI
  cd $HOME/GitHub/visbo-server-ui/
  echo "Update or Adopt: src/environments/environment.prod.ts"

# ReST Setup
# EDIT THE CONFIG File for ReST Server
cd $HOME/GitHub/visbo-server-rest/
echo "Update or Adopt: .env

# start the ReST Server
pm2 list
pm2 start $HOME/GitHub/visbo-server-rest/startReST.sh --name VisboReST
pm2 startup
echo "EXECUTE Command that was prompted!!!"
pm2 save

update-rest
update-ui


fs-ac623ef5.efs.eu-central-1.amazonaws.com
sudo mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport fs-ac623ef5.efs.eu-central-1.amazonaws.com:/ /var/centrallog
# /etc/fstab entry
fs-ac623ef5.efs.eu-central-1.amazonaws.com:/ /var/centrallog efs defaults,_netdev 0 0
