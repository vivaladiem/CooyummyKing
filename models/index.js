var Sequelize = require('sequelize')
	, sequelize
	, db;

exports.init = function(app) {
	db = app.get('config').db;
	sequelize = new Sequelize(db.database, db.username, db.password, db.options);
	sequelize.cls = require('continuation-local-storage').createNamespace('transaction'); // transaction을 위한 설정
	app.set('sequelize', sequelize);
	app.set('db', this.registerAndGetModels(sequelize));
	sequelize.sync().success(function() {
	}).error(function(err) {
		console.log(err);
	});
};

exports.registerAndGetModels = function(sequelize) {
	var User = sequelize.import(__dirname + '/users');
	var Recipe = sequelize.import(__dirname + '/recipes');
	var Like = sequelize.import(__dirname + '/likes');
	var Comment = sequelize.import(__dirname + '/comments');
	var Question = sequelize.import(__dirname + '/questions');
	var Reply = sequelize.import(__dirname + '/replies');
	var Fork = sequelize.import(__dirname + '/forks');
	var Follow = sequelize.import(__dirname + '/follows');

	Recipe.belongsTo(User, {foreignKey: 'user_id'});

	/*
	Like.belongsTo(User, {foreignKey: 'user_id'});
	Like.belongsTo(Recipe, {foreignKey: 'recipe_id'});
	Comment.belongsTo(User, {foreignKey: 'user_id'});
	Comment.belongsTo(Recipe, {foreignKey: 'recipe_id'});
	Question.belongsTo(User, {foreignKey: 'user_id'});
	Question.belongsTo(Recipe, {foreignKey: 'recipe_id'});
	Reply.belongsTo(User, {foreignKey: 'user_id'});
	Reply.belongsTo(Question, {foreignKey: 'question_id'});
	Fork.belongsTo(User, {foreignKey: 'user_id'});
	Fork.belongsTo(Recipe, {foreignKey: 'recipe_id'});
	*/

    // hasMany - through로 만들어진 테이블에만 복합 primaryKey가 생성되며 필요없는 id 컬럼이 안생긴다.
	User.hasMany(Recipe, { through: Like });
	Recipe.hasMany(User, { through: Like });

	User.hasMany(Recipe, { through: Comment });
	Recipe.hasMany(User, { through: Comment });

	// Question은 Reply 때문에 id가 있어야 해서 이와 같이 한다.
	Question.belongsTo(User);
	Question.belongsTo(Recipe);

	User.hasMany(Question, { through: Reply });
	Question.hasMany(User, { through: Reply });
	
	User.hasMany(Recipe, { through: Fork });
	Recipe.hasMany(User, { through: Fork });

	// following_id : 팔로우 당하는 사람 / follower_id: 팔로우 하는 사람
	User.hasMany(User, {foreignKey: 'following_id', as: 'follower', through: Follow });

	return {
		User: User,
		Recipe: Recipe,
		Like: Like,
		Comment: Comment,
		Question: Question,
		Reply: Reply,
		Fork: Fork,
		Follow: Follow
	};
};
