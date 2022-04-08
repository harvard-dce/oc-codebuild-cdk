import { expect as expectCDK, matchTemplate, MatchStyle } from '@aws-cdk/assert';
import * as cdk from '@aws-cdk/core';
import * as OcCodebuildCdk from '../lib/opencast-codebuild-stack';

test('Empty Stack', () => {
	const app = new cdk.App();
	// WHEN
	const stack = new OcCodebuildCdk.OpencastCodebuild(app, 'MyTestStack');
	// THEN
	expectCDK(stack).to(matchTemplate({
		"Resources": {}
	}, MatchStyle.EXACT))
});
