var crypto = require('crypto')
	, path = require('path')
	, fs = require('fs')
	, validator = require('validator')
	, _ = require('underscore')
	, formidable = require('formidable')
	, uploadDir
	, userDir
	, recipeDir
	, sequelize
	, User
	, Recipe
	, Comment
	, Question
	, Reply
	, Like
	, Fork
	, handlers;

exports.init = function(app) {
	uploadDir = path.join(__dirname, '..', 'files');
	userDir = path.join(uploadDir, 'users');
	recipeDir = path.join(uploadDir, 'recipes');
	sequelize = app.get('sequelize');
	User = app.get('db').User;
	Recipe = app.get('db').Recipe;
	Comment = app.get('db').Comment;
	Question = app.get('db').Question;
	Reply = app.get('db').Reply;
	Like = app.get('db').Like;
	Fork = app.get('db').Fork;

	/* API */
	app.post('/users', handlers.createUser);
	app.post('/tokens', handlers.createToken);
	app.post('/users/:user_id', handlers.getUser);
	app.get('/users/count', handlers.getUsersCount);
	app.post('/users/:user_id/delete', handlers.deleteUser);
	app.post('/users/:user_id/update', handlers.updateUser);
	app.post('/recipes', handlers.createRecipe);
	app.post('/recipes/list', handlers.getRecipeList); // 레시피 목록
	app.post('/recipes/:recipe_id', handlers.getRecipe); // 레시피 상세보기
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
}

function getLogFormat(req) {
	return req.ip + ' - - "' + req.method + ' ' + req.path + '" ';
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

		User.find({ where: { email: email } }).success(function(user) {
			if (user) {
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
				password: password,
				token: token,
				phone: phone,
				profile_text: profile_text,
				profile_image_name: profileImageName
			};

			User.create(userData).success(function(user) {
				//logger.info(getLogFormat(req) + '유저 생성 성공 / user_id: ' + user.values.id);
				res.status(200).send({result: 1, user_id: user.get('id')});
			}).error(function(err) {
				console.log(getLogFormat(req) + '유저 생성 실패 Sequelize 오류 / email: ' + email);
				console.log(err);
				fs.unlink(profileImagePath, function(err) {
					if (err) throw err;
				});
				sendError(res, '서버 오류');
			});
		}).error(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 Sequelize 오류 / email: ' + email);
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

		User.find({ where: { email: email } }).success(function(user) {
			if (user) {
				if (user.authenticate(password)) {
					//logger.info(getLogFOrmat(req) + '유저 인증 성공 /user_id: ' + user.id);
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
		}).error(function(err) {
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

		User.find(userId).then(function(user) {
			if (user) {
				//logger.info(getLogFormat(req) + '유저 조회 성공 / user_id: ' + userId);
				fs.readFile(path.join(userDir, user.get('profile_image_name')), function(err, file) {
					if (err) {}
					if (file) res.download(file.path);
					res.status(200).send({
						result: 1,
						user: {
							user_id: user.get('id'),
							email: user.get('email'),
							username: user.get('name'),
							phone: user.get('phone'),
							profile_text: user.get('profile_text'),
							point: user.get('point'),
							level: user.get('level'),
							recipe_count: user.get('recipe_count')
						}
					});
				});
			} else {
				console.log(getLogFormat(req) + '유저 정보 없음 / user_id: ' + userId);
				sendError(res, '유저 정보가 없습니다');
			}
		}).error(function(err) {
			console.log(getLogFormat(req) + '유저 조회 실패 sequelize 오류 / user_id: ' + userId);
			console.log(err);
			sendError(res, '서버 오류');
		});
	},

	getUsersCount: function(req, res) {
		User.count().then(function(count) {
			res.status(200).send({
				result: 1,
				count: count
			});
		});
	},

	deleteUser: function(req, res) {

	},

	updateUser: function(req, res) {},

	createRecipe: function(req, res) {
		var userId = req.body.user_id,
			token = req.body.token,
			title = req.body.title,
			description = req.body.description,
			text = req.body.text,
			cooking_time = parseInt(req.body.cooking_time);

		if (!validator.isNumeric(userId) || validator.isNull(title)) {
			console.log(getLogFormat(req) + '잘못된 요청 / user_id: ' + userId);
			sendError(res, '잘못된 요청입니다');
			return;
		}

		User.find({ where: {user_id: userId}, attributes: token }).then(function(user) {
			if (token != user.get('token')) {
				console.log(getLogFormat(req) + '권한 없음 / user_id: ' + userId);
				sendError(res, '권한이 없습니다.');
				return;
			}

			var data = {
				user_id: userId,
				title: title,
				description: description,
				cooking_time: cooking_time
			};

			Recipe.create(data).then(function(recipe) {
				//loger.info(getLogFormat(req) + '레시피 생성 성공 / user_id: userId);
				res.status(200).send({
					result: 1,
					recipe_id: recipe.get('id'),
					title: recipe.get('title'),
					description: recipe.get('description'),
					cooking_time: recipe.get('cooking_time')
				});
			}).error(function(err) {
				console.log(getLogFormat(req) + '레시피 생성 실패 Sequelize 오류 / user_id: ' + userId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		});
	},

	getRecipeList: function(req, res) {
		var recipes = [];
		var topRecipeNum = 2; // 상위 10% 레시피의 갯수. 레시피 갯수 20개 미만일 때 오류방지 위해 2개로 초기화

		var temp = [];

		// 상위 10%중 랜덤 2개, 나머지 90%중 10개를 가져옴
		sequelize.transaction(function(t) {
			Recipe.count().then(function(count) {
				if (count >= 20)
					topRecipeNum = parseInt(count / 10);
			}).error(function(err) {});

			Recipe.findAll({ order: 'like DESC', limit: topRecipeNum, attributes: 'id' }).then(function(results) {
				temp = results;
				recipes.push(_.sample(results, 2));
			}).error(function(err) {
				console.log(getLogFormat(req) + '레시피 조회 실패 Sequelize 오류');
				console.log(err);
				sendError(res, '서버 오류');
			});

			Recipe.findAll({ attributes: 'id' }).then(function(results) {
				recipes.push(
					_.chain(results)
					.fileter(function(recipe) { return !_.contains(temp, recipe); })
					.sample(10)
				);

			}).error(function(err) {
				console.log(getLogFormat(req) + '레시피 조회 실패 Sequelize 오류');
				console.log(err);
				sendError(res, '서버 오류');
			});

			Recipe.findAll({ where: { id: recipes } }).then(function(results) {
				//logger.info(getLogFormat(req) + '레시피 조회 성공);
				res.status(200).send({
					result: 1,
					recipes: results
				});
			}).error(function(err) {
				console.log(getLogFormat(Req) + '레시피 조회 실패 Sequelize 오류');
				console.log(err);
				sendError(res,' 서버 오류');
			});
		});
	},

	getRecipe: function(req, res) {
		var recipeId = req.body.recipe_id,
			userId = req.body.user_id;

		Recipe.find(recipeId).then(function(recipe) {}).error(function(err) {});
	},

	deleteRecipe: function(req, res) {},
	updateRecipe: function(req, res) {},
	likeRecipe: function(req, res) {
		var userId = req.body.user_id,
			recipeId = req.body.recipe_id,
			isExist = true;

		sequelize.transaction(function(t) {
			Recipe.find(recipeId).then(function(recipe) {
				if (!recipe) isExist = false;
			}).error(function(err) {
				console.log(getLogFormat(req) + '레시피 조회 실패 Sequelize 오류 / recipe_id: ' + recipeId);
				console.log(err);
				sendError(res, '서버 오류');
			});

			User.find(userId).then(function(user) {
				if (!user) isExist = false;
			}).error(function(err) {
				console.log(getLogFormat(req) + '유저 조회 실패 Sequelize 오류 / user_id: ' + userId);
				console.log(err);
				sendError(res, '서버 오류');
			});

			var data = {user_id: userId, recipe_id: recipeId};

			if (isExist) {
				Like.create(data).then(function(result) {
					//logger.info(getLogFormat(req) + 'like 등록 성공');
					res.status(200).send({
						result: 1
					});
				}).error(function(err) {
					console.log(getLogFormat(req) + 'Like 등록 실패 Sequelize 오류 / recipe_id: ' + recipeId);
					console.log(err);
					sendError(res, '서버 오류');
				});
			} else {
				console.log(getLogFormat(req) + '잘못된 요청');
				sendError(res, '없는 레시피나 유저입니다.');
			}
		});
	},

	unlikeRecipe: function(req, res) {
		
	},
	writeComment: function(req, res) {},
	deleteComment: function(req, res) {},
	writeQuestion: function(req, res) {},
	deleteQuestion: function(req, res) {},
	writeReply: function(req, res) {},
	deleteReply: function(req, res) {}
}

