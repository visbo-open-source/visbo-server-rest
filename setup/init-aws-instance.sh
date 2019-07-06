

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
