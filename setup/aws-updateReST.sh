LogFile="/var/log/visbo/$HOSTNAME/"`date '+%Y-%m-%d_%H:%M:%S'`"_UpdateLog"
echo $LogFile
mkdir -p /var/log/visbo/$HOSTNAME/
echo `date` "Execute Update of Visbo ReST by user" `whoami` | tee -a $LogFile
echo `date` "Update ReST Server UI" | tee -a $LogFile
cd $HOME/GitHub/visbo-server-ui
bash update-ui | tee -a $LogFile
ExitStatus=${PIPESTATUS[0]}
if [ $ExitStatus -ne 0 ]
then
  echo "FATAL: Update Visbo UI Branch failed. Exit $ExitStatus" | tee -a $LogFile
  exit $ExitStatus
fi
echo `date` "Update ReST Server" | tee -a $LogFile
cd $HOME/GitHub/visbo-server-rest
bash update-rest force | tee -a $LogFile
ExitStatus=${PIPESTATUS[0]}
if [ $ExitStatus -ne 0 ]
then
  echo "FATAL: Update Visbo ReST Server failed. Exit $ExitStatus" | tee -a $LogFile
  exit $ExitStatus
fi
echo `date` "Update ReST Server done" | tee -a $LogFile
