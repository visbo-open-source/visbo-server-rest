LogFile="/var/log/visbo/$HOSTNAME/"`date '+%Y-%m-%d_%H:%M:%S'`"_UpdateLog"
echo $LogFile
echo `date` "Execute Update of Visbo ReST by user" `whoami` | tee -a $LogFile
echo `date` "Update ReST Server" | tee -a $LogFile
cd $HOME/GitHub/visbo-server-rest | tee -a $LogFile
bash update-rest force | tee -a $LogFile
echo `date` "Update ReST Server UI" | tee -a $LogFile
cd $HOME/GitHub/visbo-server-ui | tee -a $LogFile
bash update-ui | tee -a $LogFile
echo `date` "Update ReST Server done" | tee -a $LogFile
