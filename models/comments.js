module.exports = function(sequelize, DataTypes) {
	return sequelize.define('comments', {
		user_id: {
			type: DataTypes.INTEGER,
			unique: 'comment'
		},
		recipe_id: {
			type: DataTypes.INTEGER,
			unique: 'comment'
		}
	}, {
		freezeTableName: true,
		tableName: 'comments'
	});
}
