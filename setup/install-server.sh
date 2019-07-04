# Connect with SSH:
ssh -i "$HOME/Downloads/DevVisboAWS.pem" ubuntu@dev.visbo.net

# Commands for Setup

# change root password to a specific & secure one
sudo passwd

# get version of System
lsb_release -a

# update standard packages
  /usr/lib/update-notifier/apt-check -p
  sudo apt-get update
  sudo apt-get upgrade
  # install new update packages
  sudo apt-get dist-upgrade

# get the node & npm installation
  sudo apt-get install -y nodejs
  sudo apt install -y npm
  sudo npm install -gy n
  sudo n stable
  # sudo apt install ng-common -y

# install the additional components
  sudo npm install -yg @angular/cli 
  sudo npm install apidoc -yg
  npm upgrade npm@6.9.0

# CLOSE CONNECTION AND VERIFY THAT THE VERSION IS NOW CORRECT
  echo "CLOSE CONNECTION AND VERIFY THAT THE VERSION IS NOW CORRECT"
  exit
  npm -v

# Configure Network Setup

# NGINX Setup
  sudo apt-get install software-properties-common -y
  sudo add-apt-repository ppa:nginx/stable -y
  sudo apt-get install nginx -y
  sudo systemctl start nginx
  sudo systemctl enable nginx # restart during reboot

# NGINX CONFIGURATION change
  # INSTALL SSL CERTIFICATES
  sudo mkdir /etc/nginx/ssl
  sudo chmod o-rwx /etc/nginx/ssl
  sudo cp $HOME/GitHub/visbo-server-rest/setup/PublicSSLCertificate_visbo.net /etc/nginx/ssl/visbo.net_ssl_certificate.cer
  sudo cp /dev/null /etc/nginx/ssl/_.visbo.net_private_key.key
  echo "Private KEY for CERTIFICATE MISSING"
  sudo systemctl reload nginx

  # CONFIG server-availables/dev.visbo.net
  sudo cp $HOME/GitHub/visbo-server-rest/install/nginx_dev.visbo.net /etc/nginx/sites-available/dev.visbo.net
  sudo ln -s /etc/nginx/sites-available/dev.visbo.net /etc/nginx/sites-enabled/dev.visbo.net

# VisboDevLoadBalancer-1259273035.eu-central-1.elb.amazonaws.com

# GIT setup
  mkdir $HOME/GitHub; cd $HOME/GitHub
  sudo chown ubuntu $HOME/.config
  git config --global user.name stashreader
  git config --global user.email ute.rittinghaus-koytek@visbo.de
  git init
  # save password once
  git config credential.helper store

# get the branches from bitbucket
  echo "BE CAREFULL First use needs password so no multi line support"
  git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-rest.git --branch development --single-branch

  git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-ui.git --branch development --single-branch

# install modules for the two components
  chown -R ubuntu:ubuntu $HOME/.npm
  cd $HOME/GitHub/visbo-server-rest; npm install
  cd $HOME/GitHub/visbo-server-ui; npm install

# EDIT the $HOME/bin/update-* Commands
  cd $HOME; mkdir bin; cd bin
  cp $HOME/GitHub/visbo-server-rest/setup/update-rest .
  cp $HOME/GitHub/visbo-server-rest/setup/update-ui .

  chmod u+x $HOME/bin/update*

# Create Web Folder /var/www/apidoc & /var/www/visbo-web-ui and log folder
  sudo mkdir /var/www/apidoc ; sudo mkdir /var/www/visbo-web-ui ; sudo mkdir /var/log/visbo
  sudo chown ubuntu:ubuntu  /var/www/apidoc /var/www/visbo-web-ui /var/log/visbo

# install PM2 Process manager
  sudo npm install pm2@latest -g
  ## no sudo for pm2, it runs as user not as root
  pm2 install pm2-logrotate

# install mongo clients
  echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu bionic/mongodb-org/4.0 multiverse"| sudo tee /etc/apt/sources.list.d/mongodb-org-4.0.list
  sudo apt-key adv --keyserver hkp://keyserver.ubuntu.com:80 --recv 9DA31620334BD75D9DCB49F368818C72E52529D4
  sudo apt-get update
  sudo apt-get install -y mongodb-org-shell
  # ENABLE IP ADDRESS FOR Mongo DB ACCESS
  echo "ENABLE IP ADDRESS FOR Mongo DB ACCESS"

# install Redis
  sudo apt-get install redis-server -y
  # setup to restart after reboot
  sudo systemctl enable redis-server.service
  # check that it runs
  redis-cli ping

# Configure a 500 MB swap file
  sudo /bin/dd if=/dev/zero of=/var/swap.1 bs=1M count=500
  # make it a swap file
  sudo /sbin/mkswap /var/swap.1
  sudo chmod 600 /var/swap.1
  sudo /sbin/swapon /var/swap.1

# UI Setup
  # EDIT THE CONFIG File for UI
  cd $HOME/GitHub/visbo-server-ui/
  vi src/environments/environment.prod.ts

  # Build the first Version
  ng build --prod

# ReST Setup
# EDIT THE CONFIG File for ReST Server
cd $HOME/GitHub/visbo-server-rest/
vi .env
# start the ReST Server
pm2 start $HOME/GitHub/visbo-server-rest/startReST.sh --name VisboReST
pm2 startup
pm2 save
echo "EXECUTE Command that was prompted!!!"

update-rest
update-ui
