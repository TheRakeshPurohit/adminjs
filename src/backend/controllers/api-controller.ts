/* eslint-disable max-len */
/* eslint no-unused-vars: 0 */
import populator from '../utils/populator'
import Filter from '../utils/filter'
import ViewHelpers from '../utils/view-helpers'
import ForbiddenError from '../utils/forbidden-error'
import { CurrentAdmin } from '../../current-admin.interface'
import AdminBro from '../../admin-bro'
import { ActionContext, ActionRequest, RecordActionResponse } from '../actions/action.interface'
import ConfigurationError from '../utils/configuration-error'

/**
 * Controller responsible for the autogenerated API: `/admin_root/api/...`, where
 * admin_root is the `rootPath` given in {@link AdminBroOptions}.
 *
 * The best way to utilise it is to use {@link ApiClient} on the frontend.
 *
 * ### Available API endpoints
 *
 * | Endpoint                 | Method                | Description |
 * |--------------------------|-----------------------|-------------|
 * | `.../api/resources/{resourceId}/search/{query}` | {@link ApiController#search} | Search record by query string |
 * | `.../api/resources/{resourceId}/actions/{action}` | {@link ApiController#resourceAction} | Perform cusomised resource action |
 * | `.../api/resources/{resourceId}/records/{recordId}/{action}` | {@link ApiController#recordAction} | Perform cusomised record action |
 * | `.../api/dashboard` | {@link ApiController#dashboard} | Perform cusomised dashboard action |
 *
 * @hideconstructor
 */
class ApiController {
  private _admin: AdminBro

  private currentAdmin: CurrentAdmin

  /**
   * @param {Object} options
   * @param {AdminBroOptions} options.admin
   * @param {CurrentAdmin} [currentAdmin]
   */
  constructor({ admin }, currentAdmin) {
    this._admin = admin
    this.currentAdmin = currentAdmin
  }

  /**
   * Returns context for given action
   * @private
   *
   * @param   {ActionRequest}  request  request object
   * @return  {Promise<ActionContext>} action context
   */
  async getActionContext(request: ActionRequest): Promise<ActionContext> {
    const { resourceId, action: actionName } = request.params
    const h = new ViewHelpers(this._admin)
    const resource = this._admin.findResource(resourceId)
    const action = resource.decorate().actions[actionName]
    return {
      resource, action, h, currentAdmin: this.currentAdmin, _admin: this._admin,
    }
  }

  /**
   * Search records by query string.
   *
   * Handler function reponsible for a `.../api/resources/{resourceId}/search/{query}` route
   *
   * @param   {ActionRequest}  request
   *
   * @return  {Promise<SearchResponse>}    found records
   */
  async search(request: ActionRequest): Promise<SearchResponse> {
    const queryString = request.params && request.params.query
    const resource = this._admin.findResource(request.params.resourceId)
    const decorated = resource.decorate()
    if (!decorated.actions.list.isAccessible(this.currentAdmin, null)) {
      throw new ForbiddenError({ actionName: 'list', resourceId: resource.id() })
    }
    const titlePropertyName = decorated.titleProperty().name()

    const filters = queryString ? { [titlePropertyName]: queryString } : {}
    const filter = new Filter(filters, resource)

    const records = await resource.find(filter, {
      limit: 50,
      sort: {
        sortBy: titlePropertyName,
        direction: 'asc',
      },
    })

    return {
      records: records.map(record => record.toJSON(this.currentAdmin)),
    }
  }

  /**
   * Performs a customized {@link Action resource action}.
   * To call it use {@link ApiClient#resourceAction} method.
   *
   * Handler function reponsible for a `.../api/resources/{resourceId}/actions/{action}`
   *
   * @param   {ActionRequest}  request
   * @param   {Object}  response
   *
   * @return  {Object}  action response
   */
  async resourceAction(request: ActionRequest, response: any): Promise<any> {
    const actionContext = await this.getActionContext(request)
    if (!actionContext.action.isAccessible(this.currentAdmin, null)) {
      throw new ForbiddenError({
        actionName: actionContext.action.name,
        resourceId: actionContext.resource.id(),
      })
    }
    return actionContext.action.handler(request, response, actionContext)
  }

  /**
   * Performs a customized {@link Action record action}.
   * To call it use {@link ApiClient#recordAction} method.
   *
   * Handler function reponsible for a `.../api/resources/{resourceId}/records/{recordId}/{action}`
   *
   * @param   {ActionRequest}  request
   * @param   {any}  response
   *
   * @return  {RecordActionResponse}  action response
   * @throws  ConfigurationError      When given record action doesn't return {@link RecordJSON}
   * @throws  ForbiddenError          When user cannot perform given action: {@linkAction.isAccessible}
                                      returns false
   */
  async recordAction(request: ActionRequest, response: any): Promise<RecordActionResponse> {
    const { recordId } = request.params
    const actionContext = await this.getActionContext(request)

    let record = await actionContext.resource.findOne(recordId);
    [record] = await populator([record])

    if (!actionContext.action.isAccessible(this.currentAdmin, record)) {
      throw new ForbiddenError({
        actionName: actionContext.action.name,
        resourceId: actionContext.resource.id(),
      })
    }
    const jsonWithRecord = await actionContext.action.handler(request, response, { ...actionContext, record })

    if (jsonWithRecord && jsonWithRecord.record && jsonWithRecord.record.recordActions) {
      return jsonWithRecord
    }
    throw new ConfigurationError(
      'handler of a recordAction should return a RecordJSON object',
      'Action.handler',
    )
  }

  /**
   * Gets optional data needed by the dashboard.
   * To call it use {@link ApiClient#dashboard} method.
   *
   * Handler function reponsible for a `.../api/dashboard`
   *
   * @param   {ActionRequest}  request
   * @param   {any}  response
   *
   * @return  {Promise<any>}  action response
   */
  async dashboard(request: ActionRequest, response: any): Promise<any> {
    const h = new ViewHelpers(this._admin)
    const handler = this._admin.options.dashboard && this._admin.options.dashboard.handler
    if (handler) {
      return handler(request, response, {
        h,
        currentAdmin: this.currentAdmin,
        _admin: this._admin,
      })
    }
    return {
      message: 'You can override this method by setting up dashboard.handler fuction in AdminBro options',
    }
  }
}

export default ApiController

/**
 * Response of a Search action in the API
 * @memberof ApiController
 * @alias SearchResponse
 */
export type SearchResponse = {
  /**
   * List of records
   */
  records: Array<SearchRecord>;
}

/**
 * Response of a Search action in the API
 * @memberof ApiController
 * @alias SearchRecord
 */
export type SearchRecord = {
  /**
   * record title - value of its titleProperty
   */
  title: string;
  /**
   * Record Id
   */
  id: string;
}