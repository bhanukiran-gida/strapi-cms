/**
 * old-article controller
 */

import { factories } from '@strapi/strapi';

export default factories.createCoreController(
	'api::old-article.old-article',

	({ strapi }) => ({
		async findOne(ctx) {
			const { slug } = ctx.params;
			const entity = await strapi.db
				.query('api::old-article.old-article')
				.findOne({
					where: { slug },
				});
			const sanitizedEntity = await this.sanitizeOutput(entity, ctx);

			return this.transformResponse(sanitizedEntity);
		},
	})
);
