echo `date` "Execute Update of Visbo ReST by user" `whoami`
echo `date` "Update ReST Server"
cd $HOME/GitHub/visbo-server-rest
bash update-rest force
echo `date` "Update ReST Server UI"
cd $HOME/GitHub/visbo-server-ui
bash update-ui
echo `date` "Update ReST Server done"
