# Test Plan for Inngest Workflow Fixes

## Overview
This test plan outlines the steps to verify that all fixes to the Inngest workflow hanging issue have been successfully implemented and are working as expected.

## Test Scenarios

### 1. Basic Workflow Execution
- **Objective**: Verify that the complete workflow executes without hanging
- **Steps**:
  1. Upload a new flyer image to trigger the parsing workflow
  2. Monitor the Inngest dashboard for the `flyer/parse` event
  3. Verify that the `flyer/product-match` events are triggered for each parsed item
  4. Confirm all steps complete within expected timeframes
- **Expected Results**: All workflow steps complete successfully with no hanging events

### 2. Timeout Handling
- **Objective**: Verify that timeout mechanisms prevent indefinite hanging
- **Steps**:
  1. Monitor the logs during workflow execution
  2. Verify timeout logs appear for long-running operations
  3. Check that operations continue or fail gracefully when timeouts occur
- **Expected Results**: No workflow step runs longer than its configured timeout

### 3. Auto-Approval Rule Validation
- **Objective**: Verify that auto-approval rules are correctly validated and applied
- **Steps**:
  1. Create a test auto-approval rule in the UI
  2. Process a flyer with products that should match the rule
  3. Verify that high-confidence matches are auto-approved
  4. Check that the auto-approval reasoning is logged correctly
- **Expected Results**: Products matching the rule criteria are auto-approved with proper reasoning

### 4. Gemini API Integration
- **Objective**: Verify robust handling of Gemini API calls
- **Steps**:
  1. Monitor logs during the product matching step
  2. Verify timeout handling for Gemini API calls
  3. Check fallback logic if Gemini returns invalid responses
- **Expected Results**: Gemini API calls complete or timeout gracefully with fallback logic

### 5. Error Recovery
- **Objective**: Verify that the workflow recovers from errors without hanging
- **Steps**:
  1. Simulate errors in different parts of the workflow
  2. Check that appropriate error logs are generated
  3. Verify the workflow continues or fails gracefully
- **Expected Results**: No workflow hangs even when errors occur

### 6. Auto-Discount Application
- **Objective**: Verify that auto-discounts are applied correctly for auto-approved products
- **Steps**:
  1. Process a flyer with products that should be auto-approved
  2. Verify that discounts are applied to the matched products
  3. Check that both product and parsed item are updated correctly
- **Expected Results**: Discounts are applied correctly with proper logging

### 7. Race Condition Handling
- **Objective**: Verify that Promise.race is working correctly to prevent hanging
- **Steps**:
  1. Monitor logs for Promise.race execution
  2. Verify that operations complete or timeout as expected
- **Expected Results**: All async operations complete or timeout without hanging

## Monitoring Approach
- Use Inngest dashboard to monitor event processing
- Check server logs for detailed execution flow
- Verify database updates in Firestore
- Monitor for any stuck or pending events

## Success Criteria
- No workflow steps hang indefinitely
- All timeouts function as expected
- Error handling recovers gracefully from failures
- Auto-approval rules are correctly applied
- Discounts are automatically applied for auto-approved products
