module.exports = function(sequelize, DataTypes) {
	return sequelize.define('questions', {
		user_id: {
			type: DataTypes.INTEGER,
			unique: 'question'
		},
		recipe_id: {
			type: DataTypes.INTEGER,
			unique: 'question'
		}
	}, {
		freezeTableName: true,
		tableName: 'questions'
	});
}
