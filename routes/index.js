var crypto = require('crypto')
	, path = require('path')
	, ffs = require('final-fs')
	, validator = require('validator')
	, _ = require('lodash')
	, formidable = require('formidable')
	, usersDir
	, recipesDir
	, knex
	, handlers;

var util = require('util').inspect;
var isp = function(x) {
	console.log(util(x));
}
var log = console.log;

exports.init = function(app) {
	usersDir = app.get('usersDir');
	recipesDir = app.get('recipesDir');
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
	app.get('/recipes/:recipe_id/images', handlers.recipeImageDownload);
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
		var email = req.body.email || 'mail' + Math.floor((Math.random() * 100000) + 1) + '@test.com'
			, userName = req.body.username
			, password = req.body.password
			, phone = req.body.phone
			, profile_text = req.body.profile_text
			, profileImagePath;

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

			var userData = {
				email: email,
				name: userName,
				password: encryptPassword(password),
				token: token,
				phone: phone,
				profile_text: profile_text
			};

			knex('users').insert(userData).then(function(result) {
				// 프로필 이미지를 저장합니다
				var form = formidable.IncomingForm();
				form.keepExtensions = true;
				form.uploadDir = usersDir;
				form.parse(req, function(error, fields, files) {
					var file = files.profile;
					var fileExtension = file.name.split('.').pop();
					profileImagePath = path.join(usersDir, result[0] + '.' + fileExtension);
					ffs.rename(file.path, profileImagePath).otherwise(function(err) {
						if (err) throw err;
					});
				});

				res.status(200).send({
					result: 1, 
					user_id: result
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '유저 생성 실패 Knex 오류 / email: ' + email);
				console.log(err);
				ffs.unlink(profileImagePath).otherwise(function(err) {
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

		var columns = ['id', 'email', 'name', 'phone', 'profile_text', 'point', 'level', 'recipe_count', 'following_count', 'follower_count'];
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
		var userId = req.body.user_id || _.sample(_.range(15, 246)),
			token = req.body.token || '81a5f198c40efe2ccb82f53942c84a38',
			title = req.body.title || 'title',
			description = req.body.description,
			text = req.body.text || 'a, b, c',
			mainImageNum = parseInt(req.body.mainimage) || 1,
			cooking_time = parseInt(req.body.cooking_time) || 10,
			imageLength = null,
			textLength = null,
			recipeId = null,
			images = {},
			errMsg = [];

		if (!validator.isNumeric(userId) || validator.isNull(title)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			//sendError(res, '잘못된 요청입니다');
			//return;
		}

		knex('users').select('token').where('id', userId).first().then(function(user) {
			if (token != user.token) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				//sendError(res, '권한이 없습니다.');
				//return;
			}
			// 이미지를 임시폴더에 업로드하고 갯수를 가져옵니다.
			var form = formidable.IncomingForm();
			form.uploadDir = recipesDir;
			form.keepExtensions = true;
			form.parse(req, function(error, fields, files) {
				imageLength = _.size(files);
				if (imageLength = 0) return;
				if (error) {
					if (error.toString().indexOf('aborted')) return;
					console.log('파일 저장 실패 formidable 오류');
					//console.log('formidable error > ' + error);
					errMsg.push('이미지 저장에 실패하였습니다. 수정을 통해 다시 등록해주세요');
					return;
				}
				if (mainImageNum > imageLength) {
					mainImageNum = imageLength;
					log('메인이미지 지정에 오류가 있습니다');
					errMsg.push('메인이미지 지정에 오류가 있습니다. 마지막 이미지를 메인이미지로 지정합니다.');
				}
				_.forEach(files, function(file, index) {
					images[index] = file.path;
				});

				// 텍스트파일의 갯수를 가져옵니다.
				var textArray = text.split(',').map(function(text) { return text.toString().trim(); });
				textLength = _.size(textArray);

				var data = {
					user_id: userId,
					title: title,
					description: description,
					text_length: textLength,
					image_length: imageLength,
					main_image_num: mainImageNum,
					cooking_time: cooking_time
				};

				knex('recipes').insert(data).then(function(result) {
					var recipeDir = path.join(recipesDir, result[0].toString());
					ffs.mkdirRecursive(recipeDir).then(function() {
						// 이미지를 제자리에 옮깁니다.
						// [TODO] 예외처리 필요
						_.forEach(images, function(file, index) {
							var fileExtension = file.split('.').pop();
							var filePath = path.join(recipeDir, index + '.' + fileExtension);
							ffs.rename(file, filePath).otherwise(function(err) {
								throw err;
							});
						});

						// 텍스트를 파일로 저장합니다.
						// [TODO] 예외처리 필요
						_.forEach(textArray, function(text, index) {
							var filePath = path.join(recipeDir, (index + 1) + '.txt');
							ffs.writeFile(filePath, text).otherwise(function(err) {
								console.log(getLogFormat(req) + '텍스트파일 저장 실패 final-fs 오류');
								console.log(err);
								errMsg.push('설명 저장에 실패하였습니다. 수정기능으로 다시 작성해주세요');
								ffs.unlink(filePath).otherwise(function(err) { throw err });
							});
						});

						res.status(200).send({
							result: 1,
							recipe_id: result[0],
							error_msg: errMsg || null
						});
					}).otherwise(function(err) {
						if (err) {
							console.log(getLogFormat(req) + '폴더 생성 실패');
							console.log(err);
						}
					});

				}).catch(function(err) {
					console.log(getLogFormat(req) + '레시피 생성 실패 Sequelize 오류 / user_id: ' + userId);
					console.log(err);
					for (var file in files) {
						ffs.unlink(file).otherwise(function(err) { console.log(err) });
					}
					sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
				});
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

			knex('recipes').select('id', 'title', 'main_image_num').whereIn('id', results).then(function(recipes) {
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

		var columns = ['users.id as user_id', 'users.name as username', 'title', 'description', 'cooking_time', 'like_count', 'scrap_count'];
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
	deleteReply: function(req, res) {},
	recipeImageDownload: function(req, res) {
		var recipeId = req.params.recipe_id;
		var imagePath = path.join(recipesDir, recipeId);
		ffs.dirFiles(imagePath).then(function(files) {
			_.map(files, ffs.readFile, function(results) {
				log('async.map 실행');
				log(results);
				res.sendFile(results);
			}).otherwise(function(err) {
				log(err);
			});
		});
	}
}
