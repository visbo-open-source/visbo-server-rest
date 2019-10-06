
/ AWS WEB Server
ssh -i "$HOME/.ssh/DevVisboAWS.pem" ubuntu@ec2-52-57-203-5.eu-central-1.compute.amazonaws.com
TEMP ssh -i "$HOME/.ssh/DevVisboAWS.pem" ubuntu@ec2-3-122-116-225.eu-central-1.compute.amazonaws.com

ssh -i "$HOME/.ssh/StagVisboAWS.pem" ubuntu@ec2-35-159-33-231.eu-central-1.compute.amazonaws.com
TEMP ssh -i "$HOME/.ssh/StagVisboAWS.pem" ubuntu@ec2-35-159-33-231.eu-central-1.compute.amazonaws.com

ssh -i "$HOME/.ssh/ProdVisboAWS.pem" ubuntu@ec2-3-122-55-160.eu-central-1.compute.amazonaws.com
TEMP ssh -i "$HOME/.ssh/ProdVisboAWS.pem" ubuntu@ec2-18-195-20-28.eu-central-1.compute.amazonaws.com

fs-ac623ef5
curl http://localhost:3484/status


git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-ui.git --branch production --single-branch

# aws elasticache describe-cache-clusters --cache-cluster-id visbodevredis.xa0tw2.0001.euc1.cache.amazonaws.com:6379 visbodevredis --show-cache-node-info

redis-cli -h visbodevredis.xa0tw2.0001.euc1.cache.amazonaws.com -p 6379 monitor

cd $HOME/Downloads
alias VP="newman run -e VisboReSTAWSDevelopment.postman_environment.json 40Parallelism.postman_collection.json"

git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-rest.git --branch production --single-branch

git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-ui.git --branch production --single-branch

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

# install EFS Mount Utils

sudo apt-get -y install binutils
./build-deb.sh
sudo apt-get -y install ./build/amazon-efs-utils*deb



fs-030c235a.efs.eu-central-1.amazonaws.com
sudo mount -t nfs -o nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport fs-030c235a.efs.eu-central-1.amazonaws.com:/ /var/centrallog
# /etc/fstab entry
fs-030c235a.efs.eu-central-1.amazonaws.com:/ /var/centrallog efs defaults,_netdev 0 0


# update and create a new version of the AMI
/usr/lib/update-notifier/apt-check -p
sudo apt update && apt list --upgradeable
sudo apt-get upgrade
sudo apt-get full-upgrade
sudo apt autoremove
