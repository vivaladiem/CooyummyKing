var crypto = require('crypto')
	, path = require('path')
	, validator = require('validator')
	, _ = require('lodash')
	, Promise = require('bluebird')
	, fs = require('fs')
	, formidable = require('formidable')
	, gm = require('gm')
	, usersDir
	, recipesDir
	, knex
	, handlers;

var util = require('util').inspect;
var isp = function(x) {
	console.log(util(x));
}
var log = console.log;

Promise.promisifyAll(fs);

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
	app.get('/recipes/list', handlers.getRecipeList); // 레시피 목록, 어쩌면 조회하는 유저 id도 param에 넣어야 할지도.
	app.get('/recipes/:recipe_id/user/:user_id', handlers.getRecipe); // 레시피 상세보기
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
	app.get('/recipes/:recipe_id/images/:image_name', handlers.recipeImageDownload); //테스트하려고 임시로 image_num->image_name으로 변경
	app.get('/users/profile/:user_id', handlers.userImageDownload);
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

// TODO 시간대는 +0:00 으로 놔두고, 서비스 국가에 맞춰 자동으로 시간을 조절하는 기능을 만들어 사용해야 아 이건 클라이언트에서 하는게 좋으려나
// TODO 글 언어별로 제공해야
// TODO 멀티스레드가 의미가 있는지 잘 모르겠지만, 이점이 있다면 사용해야
// TODO delay 심한 곳 체크해서 해결해야

exports.handlers = handlers = {
	createUser: function(req, res) {
		var email = req.body.email || 'mail' + Math.floor((Math.random() * 100000) + 1) + '@test.com'
			, userName = req.body.username || '애플한입베어물고'
			, password = req.body.password || 'password'
			, phone = req.body.phone || '01012341234'
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
				form.uploadDir = usersDir;
				form.parse(req, function(error, fields, files) {
					if (error) {
						console.log(error);
						return;
					}

					var file = files.profile;
					profileImagePath = path.join(usersDir, result[0].toString());
					fs.renameAsync(file.path, profileImagePath).then(function() {
						gm(profileImagePath).resize(120, 120).noProfile().write(profileImagePath, function(err) { if (err) throw err; });
						log('프로필 파일 저장 완료: ' + profileImagePath);
					}).catch(function(err) {
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
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / email: ' + email);
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
			console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
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

	// TODO 파일을 한 번에 처리하니 좀 느리다. 따로 처리하고 클라이언트에선 두 가지 요청에 응답을 모두 받았을 때 정상처리로 처리하는게 어떤가 싶음
	// imageLength는 뭐 클라이언트에서 인자로 주면 되니까.
	// 하나가 잘못되면 나머지를 다 취소해야 하는게 문제.. 아니.. 그럴필요는 없나? 그냥 다시 업로드하라고만 알려주면 되니까? 파일만큼은 삭제해야겠지만
	// 지금 이건 평행하게 진행되는게 어디까진지 잘 모르겠다아.
	// 아 시간없다 나중에
	createRecipe: function(req, res) {
		var form = formidable.IncomingForm();
		form.uploadDir = recipesDir;
		//form.keepExtensions = false; // default: false
		form.parse(req, function(error, fields, files) {
			var userId = fields.user_id || req.body.user_id,
				token = fields.token || req.body.token,
				title = fields.title || req.body.title,
				inst = fields.instruction || req.body.instruction,
				mainImageIndex = parseInt(fields.main_image_index || req.body.main_image_index),
				cooking_time = parseInt(fields.cooking_time || req.body.cooking_time),
				theme = fields.theme || req.body.theme,
				ingredient = fields.ingredient || req.body.ingredient,
				source = fields.source || req.body.source,

				imageLength = files.size,
				recipeId = null,
				images = {},
				orgImgs = {}, // 편집 안된 원본 이미지도 함께 저장합니다
				errMsg = [];

			if (error) {
				if (error.toString().indexOf('aborted')) return;
				console.log('파일 저장 실패 formidable 오류');
				console.log('formidable error > ' + error);
				errMsg.push('이미지 저장에 실패하였습니다. 수정을 통해 다시 등록해주세요');
			}

			if (imageLength == 0) {
				console.log(getLogFormat(req) + '이미지가 없습니다 / user_id: ' + userId);
				sendError(res, '이미지가 없습니다.');
				return;
			}

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
				_.forEach(files, function(file, index) {
					//if (index.search("org") == -1) imageLength++; // 원본이 아닌 것만 카운트합니다.
					images[index] = file.path;
				});


				if (mainImageIndex >= imageLength || mainImageIndex == null) {
					mainImageIndex = imageLength - 1;
					log('메인이미지 지정에 오류가 있습니다');
					errMsg.push('메인이미지 지정에 오류가 있습니다. 마지막 이미지를 메인이미지로 지정합니다.');
				}

				var data = {
					user_id: userId,
					title: title,
					instruction: inst,
					image_length: imageLength,
					main_image_index: mainImageIndex,
					cooking_time: cooking_time,
					theme: theme,
					ingredient: ingredient,
					source: source
				};

				knex('recipes').insert(data).then(function(result) {
					var recipeId = result[0];
					var recipeDir = path.join(recipesDir, recipeId.toString());
					fs.mkdirAsync(recipeDir) .then(function() {
						// 이미지를 제자리에 옮깁니다.
						// [TODO] 예외처리 필요
						var imageDir = path.join(recipeDir, 'images');
						return fs.mkdirAsync(imageDir).then(function() {
							_.forEach(images, function(file, index) {
								var filePath = path.join(imageDir, index);
								fs.renameAsync(file, filePath).then(function() {
									//if (index.search("org") != -1) return;
									gm(filePath).resize(240, 240).quality(80).write(filePath + "_sm", function(err) {if (err) console.log(err);});
									gm(filePath).resize(480, 480).quality(80).write(filePath + "_md", function(err) {if (err) console.log(err);});
								}).catch(function(err) {
									log("레시피 " + recipeId + " - " + index + " : " + file);
									isp(err);
									throw err;
								});
							});
						})
					})
					.then(function() {
						res.status(200).send({
							result: 1,
							recipe_id: result[0],
							error_msg: errMsg || null
						});
					}).catch(function(err) {
						if (err) {
							console.log(getLogFormat(req) + '폴더 생성 실패');
							console.log(err);
							sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
						}
					});
				}).catch(function(err) {
					console.log(getLogFormat(req) + '레시피 생성 실패 knex 오류 / user_id: ' + userId);
					console.log(err);
					_.forEach(images, function(file) {
						log('파일을 삭제합니다 - ' + file);
						fs.unlinkAsync(file).catch(function(err) { console.log(err) });
					});
					sendError(res, '서버 오류로 인해 레시피를 생성하지 못했습니다. 다시 시도해주세요');
				});
			}).catch(function(err) {
				console.log(getLogFormat(req) + '유저 조회 실패 knex 오류 / user_id: ' + userId);
				console.log(err);
				sendError(res, '서버 오류');
			});
		})
	},

	getRecipeList: function(req, res) {
		// Execute stored procedure (require execute privilege)
		knex.raw('call getRecipeList').then(function(results) {
			results = results[0][0];
			results = _.pluck(results, 'id');

			knex('recipes').select('id', 'title', 'main_image_index').whereIn('id', results).then(function(recipes) {
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
		var userId = req.params.user_id;

		var columns = ['users.id as user_id', 'users.name as username', 'instruction', 'cooking_time', 'theme', 'ingredient', 'source', 'like_count', 'scrap_count'];
		knex('recipes').join('users', 'users.id', '=', 'recipes.user_id').select(columns).where('recipes.id', recipeId).first().then(function(recipe) {
			if (userId == recipe.user_id) {
				recipe.type = 'MY';
			}
			//logger.info(getLogFormat(req) + '레시피 조회 성공');
			log("is ingredient equals 'null'? : " + ("null" == recipe.ingredient));
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
		//var imageNum = req.params.image_num;
		var imageNum = req.params.image_name.split('.')[0];

		var imagePath = path.join(recipesDir, recipeId, 'images', imageNum);
		res.sendFile(imagePath);
	},
	userImageDownload: function(req, res) {
		var userId = req.params.user_id;
		var imagePath = path.join(usersDir, userId);
		res.sendFile(imagePath);
	}
}
