var crypto = require('crypto')
	, path = require('path')
	, fs = require('fs')
	, validator = require('validator')
	, _ = require('lodash')
	, formidable = require('formidable')
	, uploadDir
	, userDir
	, recipeDir
	, knex
	, handlers;

var util = require('util').inspect;
var isp = function(x) {
	console.log(util(x));
}
var log = console.log;

exports.init = function(app) {
	userDir = app.get('userDir');
	recipeDir = app.get('recipeDir');
	knex = app.get('knex');

	/* API */
	app.post('/users', handlers.createUser);
	app.post('/tokens', handlers.createToken);
	app.post('/users/:user_id', handlers.getUser);
	app.get('/users/count', handlers.getUsersCount);
	app.post('/users/:user_id/delete', handlers.deleteUser);
	app.post('/users/:user_id/update', handlers.updateUser);
	app.post('/users/followers', handlers.getFollowerUsers);
	app.post('/users/followings', handlers.getFollowingUsers);
	app.post('/recipes', handlers.createRecipe);
	app.post('/recipes/list', handlers.getRecipeList); // 레시피 목록
	app.get('/recipes/:recipe_id', handlers.getRecipe); // 레시피 상세보기
	app.post('/recipes/delete', handlers.deleteRecipe);
	app.post('/recipes/update', handlers.updateRecipe);
	app.post('/recipes/like', handlers.likeRecipe);
	app.post('/recipes/unlike', handlers.unlikeRecipe);
	app.post('/recipes/comment', handlers.writeComment);
	app.post('/recipes/comment/delete', handlers.deleteComment);
	app.post('/recipes/question', handlers.writeQuestion);
	app.post('/recipes/question/delete', handlers.deleteQuestion);
	app.post('/recipes/question/reply', handlers.writeReply);
	app.post('/recipes/question/reply/delete', handlers.deleteReply);
};

function sendError(res, errMsg) {
	res.status(200).send({
		result: 0,
		msg: errMsg
	});
};

function getLogFormat(req) {
	return req.ip + ' - - "' + req.method + ' ' + req.path + '" ';
};

function encryptPassword(password) {
	return crypto.createHmac('sha1', 'cymk').update(password).digest('hex');
}

exports.handlers = handlers = {
	createUser: function(req, res) {
		var email = req.body.email
			, userName = req.body.username
			, password = req.body.password
			, phone = req.body.phone
			, profile_text = req.body.profile_text
			, profileImagePath
			, profileImageName;

		if (!validator.isEmail(email) || validator.isNull(userName) || validator.isNull(password)) {
			console.log(getLogFormat(req) + '잘못된 요청 / email: ' + email);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').count('* as count').where('email', email).first().then(function(user) {
			if (user.count) {
				console.log(getLogFormat(req) + '유저 생성 실패 / email: ' + email);
				sendError(res, '이메일이 존재합니다. 해당 이메일로 로그인하시거나 다른 이메일로 가입 해주세요');
				return;
			}

			var token = crypto
			.createHash('md5')
			.update(email + (new Date()).getTime() + 'cymk')
			.digest('hex');

			/* 프로필 이미지를 저장합니다 */
			var form = formidable.IncomingForm();
			//form.keepExtensions = true;
			form.uploadDir = uploadDir
			form.parse(req, function(error, fields, files) {
				if (!files.image) return; //필요한가 모르겠다. 파일이 없으면 알아서 parse가 진행이 안되는건지.
				profileImagePath = path.join(userDir, files.image.name);
				console.log('profileImagePath type: ' + typeof (profileImagePath));
				profileImageName = files.image.name;
				fs.rename(files.image.path, profileImagePath, function(err) {
					if (err) {
						profileImageName = null;
						throw err;
					}
					//logger.info(getLogFormat(req) + '파일 저장 완료');
				});
			});

			var userData = {
				email: email,
				username: userName,
				password: encryptPassword(password),
				token: token,
				phone: phone,
				profile_text: profile_text,
				profile_image_name: profileImageName
			};

			knex('users').insert(userData).then(function(result) {
				res.status(200).send({result: 1, user_id: result});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '유저 생성 실패 Knex 오류 / email: ' + email);
				console.log(err);
				fs.unlink(profileImagePath, function(err) {
					if (err) throw err;
				});
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 Knex 오류 / email: ' + email);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	createToken: function(req, res) {
		var email = req.body.email,
			password = req.body.password;

		if (!validator.isEmail(email) || validator.isNull(password)) {
			console.log(getLogFormat(req) + '잘못된 요청 / email : ' + email);
			sendError(res, '잘못된 요청입니다.');
			return;
		}

		knex('users').select('id', 'password', 'token').where('email', email).first().then(function(user) {
			if (user) {
				if (encryptPassword(password) === user.password) {
					res.status(200).send({
						result: 1,
						user_id: user.id,
						token: user.token
					});
				} else {
					console.log(getLogFormat(req) + '패스워드 불일치 / user_id: ' + user.id);
					sendError(res, '패스워드가 일치하지 않습니다. 다시 확인해 주세요');
				}
			} else {
				console.log(getLogFormat(req) + '유저 정보 없음 / email: ' + email);
				sendError(res, '정보가 존재하지 않습니다. 회원가입 후 로그인 해주세요');
			}
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 sequelize 오류 / email: ' + email);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getUser: function(req, res) {
		var userId = req.params.user_id;

		if (!validator.isNumeric(userId)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user-id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		var columns = ['id', 'email', 'name', 'phone', 'profile_text', 'profile_image_name', 'point', 'level', 'recipe_count', 'following_count', 'follower_count'];
		knex('users').select(columns).where('id', userId).first().then(function(user) {
			if (!user) {
				console.log(getLogFormat(req) + '유저 정보 없음 / user_id: ' + userId);
				sendError(res, '유저 정보가 없습니다');
			}
			//logger.info(getLogFormat(req) + '유저 조회 성공 / user_id: ' + userId);
			res.status(200).send({
				result: 1,
				user: {
					user_id: user.id,
					email: user.email,
					username: user.name,
					phone: user.phone,
					profile_text: user.profile_text,
					profile_image_name: user.profile_image_name,
					point: user.point,
					level: user.level,
					recipe_count: user.recipe_count,
					following_count: user.following_count,
					follower_count: user.follower_count
				}
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 sequelize 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getUsersCount: function(req, res) {
		console.log(knex('users').count('* as count').first().toString());
		knex('users').count('* as count').then(function(result) {
			res.status(200).send({
				result: 1,
				count: result[0].count
			});
		});
	},

	deleteUser: function(req, res) {

	},

	updateUser: function(req, res) {},

	getFollowerUsers: function(req, res) {},

	getFollowingUsers: function(req, res) {},

	createRecipe: function(req, res) {
		var userId = req.body.user_id,
			token = req.body.token,
			title = req.body.title,
			description = req.body.description,
			text = req.body.text,
			mainImage = parseInt(req.body.mainimage),
			cooking_time = parseInt(req.body.cooking_time),
			resultCode = 1;

		if (!validator.isNumeric(userId) || validator.isNull(title)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (token != user.token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				sendError(res, '권한이 없습니다.');
				return;
			}

			var form = formidable.IncomingForm();
			form.keepExtensions = true;
			form.uploadDir = recipeDir;
			form.parse(req, function(error, fields, files) {
				if (error) resultCode = 2;
				if (!files.image) return;
				if (mainImage > files.length) {
					mainImage = files.length;
					//errMsg = '메인이미지 지정에 오류가 있습니다';
				}
				_.forEach(files, function(file) {
					profileImagePath = path.join(userDir, file.image.name);
					profileImageName = file.image.name;
					fs.rename(file.image.path, profileImgaePath, function(err) {
						if (err) {
							profileImageName = null;
							throw err;
						}
					});
				});
			});

			var data = {
				user_id: userId,
				title: title,
				description: description,
				main_image_num: mainImage,
				cooking_time: cooking_time
			};

			knex('recipes').insert(data).then(function(result) {
				res.status(200).send({
					result: 1,
					recipe_id: result
					//error_msg: errMsg
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '레시피 생성 실패 Sequelize 오류 / user_id: ' + userId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 Sequelize 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getRecipeList: function(req, res) {
		// execute stored procedure (require execute privilege)
		knex.raw('call getRecipeList').then(function(results) {
			results = results[0][0];
			results = _.pluck(results, 'id');

			knex('recipes').select('id', 'title', 'image_path', 'main_image_num').whereIn('id', results).then(function(recipes) {
				res.status(200).send({
					result: 1,
					recipes: recipes
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '레시피 조회 실패 knex 오류');
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '레시피 목록 조회 실패 knex 오류 / mysql procedure');
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getRecipe: function(req, res) {
		var recipeId = req.params.recipe_id;

		var columns = ['users.id as user_id', 'users.name as username', 'title', 'description', 'text_path', 'cooking_time', 'like_count', 'scrap_count'];
		knex('recipes').join('users', 'users.id', '=', 'recipes.user_id').select(columns).where('recipes.id', recipeId).first().then(function(recipe) {
			//logger.info(getLogFormat(req) + '레시피 조회 성공');
			res.status(200).send({
				result: 1,
				recipe: recipe
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '레시피 조회 실패 knex 오류 / recipe_id: ' + recipeId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	deleteRecipe: function(req, res) {},
	updateRecipe: function(req, res) {},

	likeRecipe: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id;

		var data = {user_id: userId, recipe_id: recipeId};

		knex('likes').insert(data).then(function(result) {
			res.status(200).send({
				result: 1
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + 'like 생성 실패 knex 오류');
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	unlikeRecipe: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id;

		var data = {user_id: useId, recipe_id: recipeId};

		knex('likes').delete(data).then(function(result) {
			res.status(200).send({
				result: 1
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + 'like 생성 실패 knex 오류');
			console.log(err);
			sendError(res, '서버 오류');
		});
	},
	writeComment: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id,
			comment = req.body.comment;
		
		if (!validator.isNumeric(userId)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (token != user.token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				sendError(res, '권한이 없습니다');
				return;
			}

			var data = {user_id: userId, recipe_id: recipeId, comment: comment};
			knex('comments').insert(data).then(function(result) {
				res.status(200).send({
					result: 1
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + 'comment 생성 실패 knex 오류 / recipe_id: ' + recipeId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	deleteComment: function(req, res) {
		var userId = req.body.user_id,
			token = req.body.token,
			recipeId = req.body.recipe_id;

		if (!validator.isNumeric(userId)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (user.token != token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				sendError(res, '권한이 없습니다');
				return;
			}

			var data = {user_id: userId, recipe_id: recipeId};
			knex('comments').delete(data).then(function(result) {
				res.status(200).send({
					result: 1
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + 'comment 삭제 실패 knex 오류 / recipe_id: ' + recipeId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		}).catch(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	writeQuestion: function(req, res) {},
	deleteQuestion: function(req, res) {},
	writeReply: function(req, res) {},
	deleteReply: function(req, res) {}
}
