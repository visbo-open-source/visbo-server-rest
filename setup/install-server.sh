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
  sudo apt install npm
  sudo npm install -g n
  sudo n stable

# install the additional components
  sudo npm install -g @angular/cli 
  sudo npm install apidoc -g
  npm upgrade npm@6.9.0

# CLOSE CONNECTION AND VERIFY THAT THE VERSION IS NOW CORRECT
  echo "CLOSE CONNECTION AND VERIFY THAT THE VERSION IS NOW CORRECT"
  exit
  npm -v

# Configure Network Setup

# NGINX Setup
  sudo apt-get install software-properties-common
  sudo add-apt-repository ppa:nginx/stable
  sudo apt-get install nginx
  sudo systemctl start nginx
  sudo systemctl enable nginx # restart during reboot

# NGINX CONFIGURATION change
  # INSTALL SSL CERTIFICATES
  # CONFIG server-availables/dev.visbo.net
  sudo systemctl reload nginx

# GIT setup
  mkdir $HOME/GitHub; cd $HOME/GitHub
  sudo chown ubuntu $HOME/.config
  git config --global user.name stashreader
  git config --global user.email ute.rittinghaus-koytek@visbo.de
  git init
  # save password once
  git config credential.helper store

# get the branches from bitbucket
  git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-rest.git --branch development --single-branch
  git clone https://stashReader@bitbucket.org/visboAtlassian/visbo-server-ui.git --branch development --single-branch

# install modules for the two components
  cd $HOME/GitHub/visbo-server-rest; npm install
  cd $HOME/GitHub/visbo-server-ui; npm install

# EDIT the $HOME/bin/update-* Commands
  cd $HOME; mkdir bin; cd bin
  # TODO: create the commands here with the script
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
  sudo apt-get install redis-server
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

update-rest
update-ui
