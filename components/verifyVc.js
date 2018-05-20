var mongoose = require('mongoose');
var VisboCenter = mongoose.model('VisboCenter');
var logging = require('./../components/logging');
var debuglevel = 0;

// Verify Visbo Center and the role of the user
function verifyVc(req, res, next) {

	if (req.url == '/') {
		// no common check here, special check done in code afterwards
		return next();
	}
	var vcid = req.url.split('/')[1];
	var userId = req.decoded._id;
	var useremail = req.decoded.email;

	debuglog(debuglevel, 8, "Verify access permission for VisboCenter %s to User %s ", vcid, useremail);
	// return next();
	var queryVC = VisboCenter.findOne({'_id':vcid, 'users.email': useremail});
	// queryVC.select('name users updatedAt createdAt');
	queryVC.exec(function (err, oneVC) {
		if (err) {
			return res.status(500).send({
				state: 'failure',
				message: 'Error getting Visbo Centers',
				error: err
			});
		}
		if (!oneVC) {
			return res.status(403).send({
				state: 'failure',
				message: 'No Visbo Center or no Permission'
			});
		}
		req.oneVC = oneVC
		req.oneVCisAdmin = false
		for (var i = 0; i < oneVC.users.length; i++){
			if (oneVC.users[i].email == useremail && oneVC.users[i].role == 'Admin' ) {
				req.oneVCisAdmin = true;
			}
		}
		debuglog(debuglevel, 1, "Found VisboCenter %s Admin Access %s", vcid, req.oneVCisAdmin);
		return next();
	});
}
	// var token = req.headers['access-key'];
  //
	// // decode token
  // if (token) {
  //
  //   // verifies secret and checks exp
  //   jwt.verify(token, jwtSecret.user.secret, function(err, decoded) {
  //     if (err) {
  //       return res.status(400).send({
  //       	state: 'failure',
  //       	message: 'Token is dead'
  //       });
  //     } else {
  //       // if everything is good, save to request for use in other routes
  //       req.decoded = decoded._doc;
  //       return next();
  //     }
  //   });
  // }
  // else {
  // 	// if the user is not authenticated
	// 	return res.status(400).send({
	// 		state: 'failure',
	// 		message: 'No token provided'
	// 	});
  // }
// };

module.exports = {
	verifyVc: verifyVc
};
