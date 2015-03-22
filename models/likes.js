module.exports = function(sequelize, DataTypes) {
	return sequelize.define('likes', {
		id: {
			type: DataTypes.INTEGER,
			allowNull: false,
			primaryKey: true,
			autoIncerment: true
		}
	}, {
		freezeTableName: true,
		tableName: 'likes'
	});
}
